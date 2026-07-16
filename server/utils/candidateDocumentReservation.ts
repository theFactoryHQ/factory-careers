import { and, eq, sql, type SQL } from 'drizzle-orm'
import { document } from '../database/schema'
import { db } from './db'
import { logError, logWarn } from './logger'
import {
  cancelDocumentProcessingTasksInTransaction,
  completePendingUploadReconciliationTaskWithDomainWriteInTransaction,
  documentUploadReconciliationAvailableAt,
  enqueueProcessingTaskInTransaction,
  type PendingUploadReconciliationCompletionOutcome,
  type ProcessingQueueDatabaseExecutor,
} from './processingQueue'
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
  uploadStatus: 'pending' | 'completed'
  processingTaskId: string
  createdAt: Date
}

export type CandidateDocumentReservationTransaction = {
  lockCandidateDocuments(input: { organizationId: string; candidateId: string }): Promise<void>
  countCandidateDocuments(input: { organizationId: string; candidateId: string }): Promise<number>
  insertDocument(input: Omit<CandidateDocumentReservationInput, 'maxDocumentsPerCandidate'>): Promise<Omit<ReservedCandidateDocument, 'processingTaskId'>>
  enqueueUploadReconciliation(input: {
    organizationId: string
    documentId: string
    availableAt: Date
  }): Promise<{ id: string; batchId: string }>
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

export type CandidateDocumentFinalizationInput = {
  documentId: string
  organizationId: string
  candidateId: string
  processingTaskId: string
  parsedContent: unknown
}

type FinalizedCandidateDocument = Omit<ReservedCandidateDocument, 'processingTaskId'>

export type CandidateDocumentFinalizationAdapter = {
  finalizeDocument(input: CandidateDocumentFinalizationInput): Promise<{
    document: FinalizedCandidateDocument
    taskOutcome: PendingUploadReconciliationCompletionOutcome
  }>
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
            uploadStatus: document.uploadStatus,
            createdAt: document.createdAt,
          })
        if (!created) throw new Error('Failed to reserve candidate document')
        return created
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
    }))
  },
}

const finalizationAdapter: CandidateDocumentFinalizationAdapter = {
  async finalizeDocument(input) {
    return db.transaction(async (tx) => {
      const finalized = await completePendingUploadReconciliationTaskWithDomainWriteInTransaction(
        tx as unknown as ProcessingQueueDatabaseExecutor,
        {
          organizationId: input.organizationId,
          taskId: input.processingTaskId,
          documentId: input.documentId,
        },
        async (executor) => {
          const [completed] = await executor.update(document)
            .set({
              parsedContent: input.parsedContent as any,
              uploadStatus: 'completed',
            })
            .where(and(
              eq(document.id, input.documentId),
              eq(document.organizationId, input.organizationId),
              eq(document.candidateId, input.candidateId),
              eq(document.uploadStatus, 'pending'),
            ))
            .returning({
              id: document.id,
              type: document.type,
              originalFilename: document.originalFilename,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
              uploadStatus: document.uploadStatus,
              createdAt: document.createdAt,
            })
          if (!completed) {
            // A slow uploader can finish after reconciliation has already moved
            // the task to processing and completed the reserved row. Treat that
            // repeated finalization as idempotent while preserving tenant and
            // candidate scoping.
            const [existingCompleted] = await executor.select({
              id: document.id,
              type: document.type,
              originalFilename: document.originalFilename,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
              uploadStatus: document.uploadStatus,
              createdAt: document.createdAt,
            })
              .from(document)
              .where(and(
                eq(document.id, input.documentId),
                eq(document.organizationId, input.organizationId),
                eq(document.candidateId, input.candidateId),
                eq(document.uploadStatus, 'completed'),
              ))
              .limit(1)
            if (!existingCompleted) {
              throw new Error('Candidate document finalization target was not found')
            }
            return existingCompleted
          }
          return completed
        },
      )
      if (finalized.operationRan) {
        return { document: finalized.result!, taskOutcome: finalized.outcome }
      }
      const [completedDocument] = await tx.select({
        id: document.id,
        type: document.type,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        uploadStatus: document.uploadStatus,
        createdAt: document.createdAt,
      })
        .from(document)
        .where(and(
          eq(document.id, input.documentId),
          eq(document.organizationId, input.organizationId),
          eq(document.candidateId, input.candidateId),
          eq(document.uploadStatus, 'completed'),
        ))
        .limit(1)
      if (!completedDocument) throw new Error('Completed candidate document was not found')
      return { document: completedDocument, taskOutcome: finalized.outcome }
    })
  },
}

const rollbackAdapter: CandidateDocumentRollbackAdapter = {
  async deleteReservedDocument(input) {
    await db.transaction(async (tx) => {
      await cancelDocumentProcessingTasksInTransaction(
        tx as unknown as ProcessingQueueDatabaseExecutor,
        {
          organizationId: input.organizationId,
          documentIds: [input.documentId],
        },
      )
      const [reservedDocument] = await tx.select({ id: document.id })
        .from(document)
        .where(and(
          eq(document.id, input.documentId),
          eq(document.organizationId, input.organizationId),
          eq(document.candidateId, input.candidateId),
        ))
        .limit(1)
        .for('update')
      if (!reservedDocument) return
      await tx.delete(document).where(and(
        eq(document.id, input.documentId),
        eq(document.organizationId, input.organizationId),
        eq(document.candidateId, input.candidateId),
      ))
    })
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
    const reservedDocument = await tx.insertDocument(documentInput)
    const reconciliationTask = await tx.enqueueUploadReconciliation({
      organizationId: input.organizationId,
      documentId: input.id,
      availableAt: documentUploadReconciliationAvailableAt(),
    })
    return {
      ...reservedDocument,
      processingTaskId: reconciliationTask.id,
    }
  })
}

export async function finalizeCandidateDocumentUpload(
  input: CandidateDocumentFinalizationInput,
  adapter: CandidateDocumentFinalizationAdapter = finalizationAdapter,
): Promise<FinalizedCandidateDocument> {
  const finalized = await adapter.finalizeDocument(input)
  return finalized.document
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
  } catch {
    logError('document.reservation_rollback_failed', {
      result_code: 'relational_cleanup_failed',
    })
    return { relationalCleanupSucceeded: false }
  }

  try {
    await adapter.deleteStorageObject(input.storageKey)
  } catch {
    logWarn('document.s3_orphan_cleanup_failed', {
      result_code: 'storage_cleanup_failed',
    })
  }

  return { relationalCleanupSucceeded: true }
}
