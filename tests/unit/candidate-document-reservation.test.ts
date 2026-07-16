import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  CandidateDocumentLimitError,
  finalizeCandidateDocumentUpload,
  reserveCandidateDocument,
  rollbackCandidateDocumentUpload,
  type CandidateDocumentReservationAdapter,
  type CandidateDocumentReservationTransaction,
  type CandidateDocumentRollbackAdapter,
  type CandidateDocumentFinalizationAdapter,
} from '../../server/utils/candidateDocumentReservation'
import { DOCUMENT_UPLOAD_RECONCILIATION_GRACE_MS } from '../../server/utils/processingQueue'

function createReservationAdapter(existingDocuments = 0) {
  const documentIds = Array.from({ length: existingDocuments }, (_, index) => `existing-${index}`)
  let transactionQueue = Promise.resolve()

  const adapter: CandidateDocumentReservationAdapter = {
    transaction: async (operation) => {
      let release!: () => void
      const previous = transactionQueue
      transactionQueue = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous

      const working = [...documentIds]
      const tx: CandidateDocumentReservationTransaction = {
        lockCandidateDocuments: vi.fn(async () => {}),
        countCandidateDocuments: vi.fn(async () => working.length),
        insertDocument: vi.fn(async input => {
          working.push(input.id)
          return {
            id: input.id,
            type: input.type,
            originalFilename: input.originalFilename,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            uploadStatus: 'pending',
            createdAt: new Date('2026-07-16T12:00:00.000Z'),
          }
        }),
        enqueueUploadReconciliation: vi.fn(async input => ({
          id: `task-${input.documentId}`,
          batchId: `batch-${input.documentId}`,
        })),
      }

      try {
        const result = await operation(tx)
        documentIds.splice(0, documentIds.length, ...working)
        return result
      } finally {
        release()
      }
    },
  }

  return { adapter, documentIds }
}

function reservationInput(id: string) {
  return {
    id,
    organizationId: 'org-1',
    candidateId: 'candidate-1',
    type: 'resume' as const,
    storageKey: `org-1/candidate-1/${id}.pdf`,
    originalFilename: `${id}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 100,
    maxDocumentsPerCandidate: 20,
  }
}

describe('candidate document reservations', () => {
  it('serializes concurrent dashboard reservations at the document cap', async () => {
    const { adapter, documentIds } = createReservationAdapter(19)

    const results = await Promise.allSettled([
      reserveCandidateDocument(reservationInput('document-a'), adapter),
      reserveCandidateDocument(reservationInput('document-b'), adapter),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      reason: expect.any(CandidateDocumentLimitError),
    })
    expect(documentIds).toHaveLength(20)
  })

  it('reserves a pending document and its reconciliation task in one transaction', async () => {
    const events: string[] = []
    const reconciliationAvailableAt: Date[] = []
    const adapter: CandidateDocumentReservationAdapter = {
      transaction: async operation => operation({
        lockCandidateDocuments: vi.fn(async () => { events.push('lock') }),
        countCandidateDocuments: vi.fn(async () => 0),
        insertDocument: vi.fn(async input => {
          events.push('document:pending')
          return {
            id: input.id,
            type: input.type,
            originalFilename: input.originalFilename,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            uploadStatus: 'pending',
            createdAt: new Date('2026-07-16T12:00:00.000Z'),
          }
        }),
        enqueueUploadReconciliation: vi.fn(async input => {
          events.push('task:pending')
          reconciliationAvailableAt.push(input.availableAt)
          return { id: `task-${input.documentId}`, batchId: `batch-${input.documentId}` }
        }),
      }),
    }

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'))
    const reserved = await reserveCandidateDocument(reservationInput('document-1'), adapter)
    vi.useRealTimers()

    expect(reserved).toMatchObject({
      id: 'document-1',
      uploadStatus: 'pending',
      processingTaskId: 'task-document-1',
    })
    expect(events).toEqual(['lock', 'document:pending', 'task:pending'])
    expect(reconciliationAvailableAt[0]?.toISOString()).toBe(
      new Date(Date.parse('2026-07-16T12:00:00.000Z') + DOCUMENT_UPLOAD_RECONCILIATION_GRACE_MS).toISOString(),
    )
  })

  it('marks the document and reconciliation task complete atomically', async () => {
    const committed: string[] = []
    const adapter: CandidateDocumentFinalizationAdapter = {
      async finalizeDocument(input) {
        expect(input).toMatchObject({
          organizationId: 'org-1',
          processingTaskId: 'task-document-1',
          documentId: 'document-1',
        })
        committed.push('task:locked', 'document:completed', 'task:completed')
        return {
          document: {
            id: 'document-1',
            type: 'resume',
            originalFilename: 'resume.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 100,
            uploadStatus: 'completed',
            createdAt: new Date('2026-07-16T12:00:00.000Z'),
          },
          taskOutcome: 'completed',
        }
      },
    }

    const finalized = await finalizeCandidateDocumentUpload({
      documentId: 'document-1',
      organizationId: 'org-1',
      candidateId: 'candidate-1',
      processingTaskId: 'task-document-1',
      parsedContent: { text: 'Ada Lovelace' },
    }, adapter)

    expect(finalized.uploadStatus).toBe('completed')
    expect(committed).toEqual(['task:locked', 'document:completed', 'task:completed'])
  })

  it('locks the reconciliation task before updating the document', () => {
    const source = readFileSync(
      join(process.cwd(), 'server/utils/candidateDocumentReservation.ts'),
      'utf8',
    )
    const finalizationAdapter = source.slice(
      source.indexOf('const finalizationAdapter'),
      source.indexOf('const rollbackAdapter'),
    )

    expect(finalizationAdapter).toContain(
      'completePendingUploadReconciliationTaskWithDomainWriteInTransaction',
    )
    expect(finalizationAdapter.indexOf(
      'completePendingUploadReconciliationTaskWithDomainWriteInTransaction',
    )).toBeLessThan(finalizationAdapter.indexOf('executor.update(document)'))
    expect(finalizationAdapter).toContain('eq(document.uploadStatus, \'completed\')')
    expect(finalizationAdapter).not.toContain(
      "if (!completed) throw new Error('Reserved candidate document was not found')",
    )
  })

  it('commits the completed document when reconciliation already holds a lease', async () => {
    const adapter: CandidateDocumentFinalizationAdapter = {
      finalizeDocument: vi.fn(async () => ({
        document: {
          id: 'document-1',
          type: 'resume',
          originalFilename: 'resume.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          uploadStatus: 'completed',
          createdAt: new Date('2026-07-16T12:00:00.000Z'),
        },
        taskOutcome: 'processing',
      })),
    }

    await expect(finalizeCandidateDocumentUpload({
      documentId: 'document-1',
      organizationId: 'org-1',
      candidateId: 'candidate-1',
      processingTaskId: 'task-document-1',
      parsedContent: { text: 'slow upload' },
    }, adapter)).resolves.toMatchObject({
      id: 'document-1',
      uploadStatus: 'completed',
    })
  })

  it('deletes the reservation before its uploaded object', async () => {
    const events: string[] = []
    const adapter: CandidateDocumentRollbackAdapter = {
      deleteReservedDocument: vi.fn(async () => { events.push('database') }),
      deleteStorageObject: vi.fn(async () => { events.push('storage') }),
    }

    const result = await rollbackCandidateDocumentUpload({
      documentId: 'document-1',
      organizationId: 'org-1',
      candidateId: 'candidate-1',
      storageKey: 'one.pdf',
    }, adapter)

    expect(result).toEqual({ relationalCleanupSucceeded: true })
    expect(events).toEqual(['database', 'storage'])
  })

  it('cancels reconciliation history before deleting the document in one transaction', () => {
    const source = readFileSync(
      join(process.cwd(), 'server/utils/candidateDocumentReservation.ts'),
      'utf8',
    )
    const rollbackAdapter = source.slice(source.indexOf('const rollbackAdapter'))

    expect(rollbackAdapter).toContain('await db.transaction(async (tx) =>')
    expect(rollbackAdapter).toContain('cancelDocumentProcessingTasksInTransaction')
    expect(rollbackAdapter.indexOf('cancelDocumentProcessingTasksInTransaction'))
      .toBeLessThan(rollbackAdapter.indexOf('const [reservedDocument] = await tx.select'))
    expect(rollbackAdapter.indexOf('cancelDocumentProcessingTasksInTransaction'))
      .toBeLessThan(rollbackAdapter.indexOf('await tx.delete(document)'))
    expect(rollbackAdapter).not.toContain('storage_key:')
    expect(rollbackAdapter).not.toContain('error_message:')
    expect(rollbackAdapter).not.toContain('candidate_id:')
    expect(rollbackAdapter).toContain("result_code: 'storage_cleanup_failed'")
  })

  it('preserves storage when reservation cleanup fails', async () => {
    const deleteStorageObject = vi.fn(async () => {})
    const adapter: CandidateDocumentRollbackAdapter = {
      deleteReservedDocument: vi.fn(async () => { throw new Error('database unavailable') }),
      deleteStorageObject,
    }

    const result = await rollbackCandidateDocumentUpload({
      documentId: 'document-1',
      organizationId: 'org-1',
      candidateId: 'candidate-1',
      storageKey: 'one.pdf',
    }, adapter)

    expect(result).toEqual({ relationalCleanupSucceeded: false })
    expect(deleteStorageObject).not.toHaveBeenCalled()
  })
})
