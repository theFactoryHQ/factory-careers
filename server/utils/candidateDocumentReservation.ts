import { and, eq, sql, type SQL } from 'drizzle-orm'
import { document } from '../database/schema'
import { db } from './db'
import { logError, logWarn } from './logger'
import { deleteFromS3 } from './s3'

export type CandidateDocumentReservationInput = {
  id: string
  organizationId: string
  candidateId: string
  type: 'resume' | 'cover_letter' | 'other'
  storageKey: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  maxDocumentsPerCandidate: number
}

export type ReservedCandidateDocument = {
  id: string
  type: 'resume' | 'cover_letter' | 'other'
  originalFilename: string
  mimeType: string
  sizeBytes: number | null
  createdAt: Date
}

export type CandidateDocumentReservationTransaction = {
  lockCandidateDocuments(input: { organizationId: string; candidateId: string }): Promise<void>
  countCandidateDocuments(input: { organizationId: string; candidateId: string }): Promise<number>
  insertDocument(input: Omit<CandidateDocumentReservationInput, 'maxDocumentsPerCandidate'>): Promise<ReservedCandidateDocument>
}

export type CandidateDocumentReservationAdapter = {
  transaction<T>(operation: (tx: CandidateDocumentReservationTransaction) => Promise<T>): Promise<T>
}

export type CandidateDocumentRollbackInput = {
  documentId: string
  organizationId: string
  candidateId: string
  storageKey: string
}

export type CandidateDocumentRollbackAdapter = {
  deleteReservedDocument(input: Omit<CandidateDocumentRollbackInput, 'storageKey'>): Promise<void>
  deleteStorageObject(storageKey: string): Promise<void>
}

export class CandidateDocumentLimitError extends Error {
  constructor(readonly maximum: number) {
    super(`Document limit reached. Maximum ${maximum} documents per candidate`)
    this.name = 'CandidateDocumentLimitError'
  }
}

function capacityLockKey(input: { organizationId: string; candidateId: string }): string {
  return `candidate-documents:${input.organizationId}:${input.candidateId}`
}

export async function lockCandidateDocumentCapacity(
  executor: { execute(query: SQL): Promise<unknown> },
  input: { organizationId: string; candidateId: string },
): Promise<void> {
  await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${capacityLockKey(input)}))`)
}

const reservationAdapter: CandidateDocumentReservationAdapter = {
  transaction: async <T>(operation: (tx: CandidateDocumentReservationTransaction) => Promise<T>) => {
    return db.transaction(async (tx) => operation({
      async lockCandidateDocuments(input) {
        await lockCandidateDocumentCapacity(tx, input)
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
      async insertDocument(input) {
        const [created] = await tx.insert(document)
          .values(input)
          .returning({
            id: document.id,
            type: document.type,
            originalFilename: document.originalFilename,
            mimeType: document.mimeType,
            sizeBytes: document.sizeBytes,
            createdAt: document.createdAt,
          })
        if (!created) throw new Error('Failed to reserve candidate document')
        return created
      },
    }))
  },
}

const rollbackAdapter: CandidateDocumentRollbackAdapter = {
  async deleteReservedDocument(input) {
    await db.delete(document).where(and(
      eq(document.id, input.documentId),
      eq(document.organizationId, input.organizationId),
      eq(document.candidateId, input.candidateId),
    ))
  },
  deleteStorageObject: deleteFromS3,
}

export async function reserveCandidateDocument(
  input: CandidateDocumentReservationInput,
  adapter: CandidateDocumentReservationAdapter = reservationAdapter,
): Promise<ReservedCandidateDocument> {
  return adapter.transaction(async (tx) => {
    await tx.lockCandidateDocuments(input)
    const existingDocumentCount = await tx.countCandidateDocuments(input)
    if (existingDocumentCount + 1 > input.maxDocumentsPerCandidate) {
      throw new CandidateDocumentLimitError(input.maxDocumentsPerCandidate)
    }

    const { maxDocumentsPerCandidate: _maximum, ...documentInput } = input
    return tx.insertDocument(documentInput)
  })
}

export async function rollbackCandidateDocumentUpload(
  input: CandidateDocumentRollbackInput,
  adapter: CandidateDocumentRollbackAdapter = rollbackAdapter,
): Promise<{ relationalCleanupSucceeded: boolean }> {
  try {
    await adapter.deleteReservedDocument({
      documentId: input.documentId,
      organizationId: input.organizationId,
      candidateId: input.candidateId,
    })
  } catch (rollbackError) {
    logError('document.reservation_rollback_failed', {
      document_id: input.documentId,
      organization_id: input.organizationId,
      candidate_id: input.candidateId,
      error_message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
    })
    return { relationalCleanupSucceeded: false }
  }

  try {
    await adapter.deleteStorageObject(input.storageKey)
  } catch (cleanupError) {
    logWarn('document.s3_orphan_cleanup_failed', {
      document_id: input.documentId,
      storage_key: input.storageKey,
      error_message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    })
  }

  return { relationalCleanupSucceeded: true }
}
