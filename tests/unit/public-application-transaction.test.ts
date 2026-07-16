import { describe, expect, it, vi } from 'vitest'
import {
  createPublicApplication,
  type PublicApplicationTransaction,
  type PublicApplicationTransactionAdapter,
  type PublicApplicationTransactionInput,
} from '../../server/utils/createPublicApplication'
import { DOCUMENT_UPLOAD_RECONCILIATION_GRACE_MS } from '../../server/utils/processingQueue'

type State = {
  candidates: Map<string, string>
  applications: Map<string, string>
  documents: Map<string, string>
  processingTasks: Map<string, string>
  processingAvailability: Map<string, Date>
  complianceResponses: string[]
  questionResponses: string[]
}

function cloneState(state: State): State {
  return {
    candidates: new Map(state.candidates),
    applications: new Map(state.applications),
    documents: new Map(state.documents),
    processingTasks: new Map(state.processingTasks),
    processingAvailability: new Map(
      [...state.processingAvailability].map(([id, date]) => [id, new Date(date)]),
    ),
    complianceResponses: [...state.complianceResponses],
    questionResponses: [...state.questionResponses],
  }
}

function createTestAdapter(options: {
  failCompliance?: boolean
  failResponses?: boolean
} = {}) {
  const state: State = {
    candidates: new Map(),
    applications: new Map(),
    documents: new Map(),
    processingTasks: new Map(),
    processingAvailability: new Map(),
    complianceResponses: [],
    questionResponses: [],
  }
  let transactionQueue = Promise.resolve()

  const adapter: PublicApplicationTransactionAdapter = {
    transaction: async <T>(operation: (tx: PublicApplicationTransaction) => Promise<T>) => {
      let release!: () => void
      const previous = transactionQueue
      transactionQueue = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous

      const working = cloneState(state)
      const tx: PublicApplicationTransaction = {
        async upsertCandidate(input) {
          const key = `${input.organizationId}:${input.email}`
          const id = working.candidates.get(key) ?? `candidate-${working.candidates.size + 1}`
          working.candidates.set(key, id)
          return id
        },
        async countCandidateDocuments() {
          return [...working.documents.values()].filter(candidateId => candidateId === 'candidate-1').length
        },
        async lockCandidateDocuments() {},
        async insertApplication(input) {
          const key = `${input.organizationId}:${input.candidateId}:${input.jobId}`
          if (working.applications.has(key)) return null
          const id = `application-${working.applications.size + 1}`
          working.applications.set(key, id)
          return id
        },
        async insertDocuments(inputs) {
          for (const input of inputs) {
            working.documents.set(input.id, input.candidateId)
          }
        },
        async enqueueUploadReconciliation(input) {
          const taskId = `task-${input.documentId}`
          working.processingTasks.set(input.documentId, taskId)
          working.processingAvailability.set(input.documentId, input.availableAt)
          return { id: taskId, batchId: `batch-${input.documentId}` }
        },
        async insertComplianceResponse(input) {
          if (options.failCompliance) throw new Error('compliance write failed')
          working.complianceResponses.push(input.applicationId)
        },
        async insertQuestionResponses(inputs) {
          if (options.failResponses) throw new Error('response write failed')
          working.questionResponses.push(...inputs.map((input) => input.applicationId))
        },
      }

      try {
        const result = await operation(tx)
        state.candidates = working.candidates
        state.applications = working.applications
        state.documents = working.documents
        state.processingTasks = working.processingTasks
        state.processingAvailability = working.processingAvailability
        state.complianceResponses = working.complianceResponses
        state.questionResponses = working.questionResponses
        return result
      } finally {
        release()
      }
    },
  }

  return { adapter, state }
}

const applicationInput: PublicApplicationTransactionInput = {
  organizationId: 'org-1',
  jobId: 'job-1',
  candidate: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ADA@example.com',
    phone: '+1 555 0100',
    country: 'United States',
    state: 'CA',
  },
  coverLetterText: 'I would love to join.',
  compliance: {
    sex: 'female',
    jurisdiction: 'US',
    formVersion: 'US-SELF-ID-2026-05',
  },
  responses: [
    { questionId: 'question-1', value: 'Analytical Engine' },
  ],
  documents: [],
  maxDocumentsPerCandidate: 10,
}

describe('createPublicApplication transaction', () => {
  it('rolls back the candidate and application when compliance persistence fails', async () => {
    const { adapter, state } = createTestAdapter({ failCompliance: true })

    await expect(createPublicApplication(applicationInput, adapter))
      .rejects.toThrow('compliance write failed')

    expect(state.candidates.size).toBe(0)
    expect(state.applications.size).toBe(0)
    expect(state.complianceResponses).toEqual([])
    expect(state.questionResponses).toEqual([])
  })

  it('rolls back compliance and all core records when response persistence fails', async () => {
    const { adapter, state } = createTestAdapter({ failResponses: true })

    await expect(createPublicApplication(applicationInput, adapter))
      .rejects.toThrow('response write failed')

    expect(state.candidates.size).toBe(0)
    expect(state.applications.size).toBe(0)
    expect(state.complianceResponses).toEqual([])
    expect(state.questionResponses).toEqual([])
  })

  it('turns a duplicate application race into one stable conflict without duplicate records', async () => {
    const { adapter, state } = createTestAdapter()

    const results = await Promise.allSettled([
      createPublicApplication(applicationInput, adapter),
      createPublicApplication(applicationInput, adapter),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({
      reason: expect.objectContaining({
        name: 'DuplicatePublicApplicationError',
        message: 'You have already applied to this position',
      }),
    })
    expect(state.candidates.size).toBe(1)
    expect(state.applications.size).toBe(1)
    expect(state.complianceResponses).toHaveLength(1)
    expect(state.questionResponses).toHaveLength(1)
  })

  it('reserves document rows before commit so concurrent applications cannot exceed the cap', async () => {
    const { adapter, state } = createTestAdapter()
    const withDocuments = (jobId: string, firstDocument: number): PublicApplicationTransactionInput => ({
      ...applicationInput,
      jobId,
      documents: Array.from({ length: 6 }, (_, index) => {
        const number = firstDocument + index
        return {
          id: `document-${number}`,
          type: 'resume' as const,
          storageKey: `org-1/applications/document-${number}.pdf`,
          originalFilename: `resume-${number}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 100,
        }
      }),
    })

    const results = await Promise.allSettled([
      createPublicApplication(withDocuments('job-1', 1), adapter),
      createPublicApplication(withDocuments('job-2', 7), adapter),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({
        name: 'PublicApplicationDocumentLimitError',
      }),
    })
    expect(state.documents.size).toBe(6)
    expect(state.processingTasks.size).toBe(6)
    expect(state.applications.size).toBe(1)
  })

  it('returns the reconciliation task for every pending public upload', async () => {
    const { adapter, state } = createTestAdapter()
    const input: PublicApplicationTransactionInput = {
      ...applicationInput,
      documents: [{
        id: 'document-1',
        type: 'resume',
        storageKey: 'org-1/applications/document-1.pdf',
        originalFilename: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
      }],
    }

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'))
    const result = await createPublicApplication(input, adapter)
    vi.useRealTimers()

    expect(result.documentProcessingTasks).toEqual({
      'document-1': 'task-document-1',
    })
    expect(state.processingAvailability.get('document-1')?.toISOString()).toBe(
      new Date(Date.parse('2026-07-16T12:00:00.000Z') + DOCUMENT_UPLOAD_RECONCILIATION_GRACE_MS).toISOString(),
    )
  })
})
