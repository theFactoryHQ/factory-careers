import { and, eq, sql } from 'drizzle-orm'
import {
  application,
  applicationComplianceResponse,
  candidate,
  document,
  questionResponse,
} from '../database/schema'
import { db } from './db'
import { CandidateDocumentLimitError, lockCandidateDocumentCapacity } from './candidateDocumentReservation'
import {
  documentUploadReconciliationAvailableAt,
  enqueueProcessingTaskInTransaction,
  type ProcessingQueueDatabaseExecutor,
} from './processingQueue'
import {
  enqueueCandidateWorkflowEmail,
  type PreparedCandidateWorkflowEmail,
} from './candidateWorkflowEmailQueue'

type ResponseValue = string | string[] | number | boolean

type ComplianceResponseInput = {
  sex?: 'male' | 'female' | 'prefer_not_to_answer'
  raceEthnicity?: 'hispanic_or_latino' | 'white' | 'black_or_african_american' | 'asian' | 'native_hawaiian_or_pacific_islander' | 'american_indian_or_alaska_native' | 'two_or_more_races' | 'prefer_not_to_answer'
  veteranStatus?: 'protected_veteran' | 'not_protected_veteran' | 'prefer_not_to_answer'
  disabilityStatus?: 'yes' | 'no' | 'prefer_not_to_answer'
  jurisdiction: string
  formVersion: string
}

export type PublicApplicationTransactionInput = {
  organizationId: string
  jobId: string
  candidate: {
    firstName: string
    lastName: string
    email: string
    phone?: string
    country: string
    state: string
  }
  coverLetterText?: string
  compliance?: ComplianceResponseInput
  responses: Array<{
    questionId: string
    value: ResponseValue
  }>
  documents: Array<{
    id: string
    type: 'resume' | 'cover_letter' | 'other'
    storageKey: string
    originalFilename: string
    mimeType: string
    sizeBytes: number
    questionId?: string
  }>
  maxDocumentsPerCandidate: number
  candidateWorkflowEmail?: PreparedCandidateWorkflowEmail | null
}

export type PublicApplicationTransaction = {
  upsertCandidate(input: PublicApplicationTransactionInput['candidate'] & {
    organizationId: string
  }): Promise<string>
  countCandidateDocuments(input: {
    organizationId: string
    candidateId: string
  }): Promise<number>
  lockCandidateDocuments(input: {
    organizationId: string
    candidateId: string
  }): Promise<void>
  insertApplication(input: {
    organizationId: string
    candidateId: string
    jobId: string
    coverLetterText: string | null
  }): Promise<string | null>
  insertDocuments(inputs: Array<{
    id: string
    organizationId: string
    candidateId: string
    applicationId: string
    type: 'resume' | 'cover_letter' | 'other'
    storageKey: string
    originalFilename: string
    mimeType: string
    sizeBytes: number
  }>): Promise<void>
  enqueueUploadReconciliation(input: {
    organizationId: string
    documentId: string
    availableAt: Date
  }): Promise<{ id: string; batchId: string }>
  insertComplianceResponse(input: ComplianceResponseInput & {
    organizationId: string
    applicationId: string
    candidateId: string
  }): Promise<void>
  insertQuestionResponses(inputs: Array<{
    organizationId: string
    applicationId: string
    questionId: string
    value: ResponseValue
  }>): Promise<void>
  enqueueCandidateWorkflowEmail(input: {
    prepared: PreparedCandidateWorkflowEmail
    organizationId: string
    applicationId: string
    candidateId: string
    jobId: string
    transitionAt: Date
  }): Promise<void>
}

export type PublicApplicationTransactionAdapter = {
  transaction<T>(operation: (tx: PublicApplicationTransaction) => Promise<T>): Promise<T>
}

export class DuplicatePublicApplicationError extends Error {
  constructor() {
    super('You have already applied to this position')
    this.name = 'DuplicatePublicApplicationError'
  }
}

export class PublicApplicationDocumentLimitError extends CandidateDocumentLimitError {
  constructor(maximum: number) {
    super(maximum)
    this.name = 'PublicApplicationDocumentLimitError'
  }
}

const drizzleTransactionAdapter: PublicApplicationTransactionAdapter = {
  transaction: async <T>(operation: (tx: PublicApplicationTransaction) => Promise<T>) => {
    return db.transaction(async (tx) => operation({
      async upsertCandidate(input) {
        const normalizedEmail = input.email.toLowerCase()
        const [row] = await tx.insert(candidate)
          .values({
            organizationId: input.organizationId,
            firstName: input.firstName,
            lastName: input.lastName,
            email: normalizedEmail,
            phone: input.phone,
            country: input.country,
            state: input.state,
          })
          .onConflictDoUpdate({
            target: [candidate.organizationId, candidate.email],
            set: {
              firstName: sql`CASE WHEN NULLIF(BTRIM(${candidate.firstName}), '') IS NULL THEN EXCLUDED.first_name ELSE ${candidate.firstName} END`,
              lastName: sql`CASE WHEN NULLIF(BTRIM(${candidate.lastName}), '') IS NULL THEN EXCLUDED.last_name ELSE ${candidate.lastName} END`,
              phone: sql`CASE WHEN NULLIF(BTRIM(${candidate.phone}), '') IS NULL THEN EXCLUDED.phone ELSE ${candidate.phone} END`,
              country: input.country,
              state: input.state,
              updatedAt: new Date(),
            },
          })
          .returning({ id: candidate.id })

        if (!row) {
          throw new Error('Candidate upsert did not return a record')
        }
        return row.id
      },

      async countCandidateDocuments(input) {
        const [row] = await tx.select({ count: sql<number>`count(*)::int` })
          .from(document)
          .where(and(
            eq(document.organizationId, input.organizationId),
            eq(document.candidateId, input.candidateId),
          ))
        return row?.count ?? 0
      },

      async lockCandidateDocuments(input) {
        await lockCandidateDocumentCapacity(tx, input)
      },

      async insertApplication(input) {
        const [row] = await tx.insert(application)
          .values({
            organizationId: input.organizationId,
            candidateId: input.candidateId,
            jobId: input.jobId,
            status: 'new',
            coverLetterText: input.coverLetterText,
          })
          .onConflictDoNothing({
            target: [application.organizationId, application.candidateId, application.jobId],
          })
          .returning({ id: application.id })
        return row?.id ?? null
      },

      async insertDocuments(inputs) {
        await tx.insert(document).values(inputs)
      },

      async enqueueUploadReconciliation(input) {
        const { task, batchId } = await enqueueProcessingTaskInTransaction(
          tx as unknown as ProcessingQueueDatabaseExecutor,
          {
            organizationId: input.organizationId,
            type: 'document_upload_reconciliation',
            resourceId: input.documentId,
            availableAt: input.availableAt,
          },
        )
        return { id: task.id, batchId }
      },

      async insertComplianceResponse(input) {
        await tx.insert(applicationComplianceResponse).values(input)
      },

      async insertQuestionResponses(inputs) {
        await tx.insert(questionResponse).values(inputs)
      },

      async enqueueCandidateWorkflowEmail(input) {
        await enqueueCandidateWorkflowEmail(tx as unknown as Pick<typeof db, 'insert'>, input)
      },
    }))
  },
}

/**
 * Persist the relational core of a public application as one transaction.
 * File uploads and source attribution intentionally stay outside this boundary.
 */
export async function createPublicApplication(
  input: PublicApplicationTransactionInput,
  adapter: PublicApplicationTransactionAdapter = drizzleTransactionAdapter,
): Promise<{
  candidateId: string
  applicationId: string
  documentProcessingTasks: Record<string, string>
}> {
  return adapter.transaction(async (tx) => {
    const candidateId = await tx.upsertCandidate({
      organizationId: input.organizationId,
      ...input.candidate,
      email: input.candidate.email.toLowerCase(),
    })

    if (input.documents.length > 0) {
      await tx.lockCandidateDocuments({
        organizationId: input.organizationId,
        candidateId,
      })
      const existingDocumentCount = await tx.countCandidateDocuments({
        organizationId: input.organizationId,
        candidateId,
      })
      if (existingDocumentCount + input.documents.length > input.maxDocumentsPerCandidate) {
        throw new PublicApplicationDocumentLimitError(input.maxDocumentsPerCandidate)
      }
    }

    const applicationId = await tx.insertApplication({
      organizationId: input.organizationId,
      candidateId,
      jobId: input.jobId,
      coverLetterText: input.coverLetterText || null,
    })
    if (!applicationId) {
      throw new DuplicatePublicApplicationError()
    }

    const documentProcessingTasks: Record<string, string> = {}
    if (input.documents.length > 0) {
      await tx.insertDocuments(input.documents.map(({ questionId: _questionId, ...reservedDocument }) => ({
        organizationId: input.organizationId,
        candidateId,
        applicationId,
        ...reservedDocument,
      })))
      const reconciliationAvailableAt = documentUploadReconciliationAvailableAt()
      for (const reservedDocument of input.documents) {
        const task = await tx.enqueueUploadReconciliation({
          organizationId: input.organizationId,
          documentId: reservedDocument.id,
          availableAt: reconciliationAvailableAt,
        })
        documentProcessingTasks[reservedDocument.id] = task.id
      }
    }

    if (input.compliance) {
      await tx.insertComplianceResponse({
        organizationId: input.organizationId,
        applicationId,
        candidateId,
        ...input.compliance,
      })
    }

    const responses = [
      ...input.responses,
      ...input.documents.flatMap(reservedDocument => reservedDocument.questionId
        ? [{ questionId: reservedDocument.questionId, value: reservedDocument.id }]
        : []),
    ]
    if (responses.length > 0) {
      await tx.insertQuestionResponses(responses.map((response) => ({
        organizationId: input.organizationId,
        applicationId,
        ...response,
      })))
    }

    if (input.candidateWorkflowEmail) {
      await tx.enqueueCandidateWorkflowEmail({
        prepared: input.candidateWorkflowEmail,
        organizationId: input.organizationId,
        applicationId,
        candidateId,
        jobId: input.jobId,
        transitionAt: input.candidateWorkflowEmail.scheduledFor,
      })
    }

    return { candidateId, applicationId, documentProcessingTasks }
  })
}
