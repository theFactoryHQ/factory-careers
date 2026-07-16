import { describe, expect, it, vi } from 'vitest'
import {
  CandidateDocumentLimitError,
  reserveCandidateDocument,
  rollbackCandidateDocumentUpload,
  type CandidateDocumentReservationAdapter,
  type CandidateDocumentReservationTransaction,
  type CandidateDocumentRollbackAdapter,
} from '../../server/utils/candidateDocumentReservation'

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
            createdAt: new Date('2026-07-16T12:00:00.000Z'),
          }
        }),
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
