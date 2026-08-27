import { and, eq } from 'drizzle-orm'
import { document } from '../database/schema'
import { db } from './db'
import { enqueueDocumentErasure } from './documentErasureQueue'
import {
  cancelDocumentProcessingTasksInTransaction,
  type ProcessingQueueDatabaseExecutor,
} from './processingQueue'

export type DocumentDeletionResult = {
  id: string
}

export type DocumentDeletionAdapter = {
  deleteRelationalRecord(input: {
    organizationId: string
    documentId: string
  }): Promise<DocumentDeletionResult | null>
}

export async function deleteDocumentRelationalRecordWithProcessingHistory(input: {
  organizationId: string
  documentId: string
}): Promise<DocumentDeletionResult | null> {
  return db.transaction(async (tx) => {
    await cancelDocumentProcessingTasksInTransaction(
      tx as unknown as ProcessingQueueDatabaseExecutor,
      {
        organizationId: input.organizationId,
        documentIds: [input.documentId],
      },
    )
    const [lockedDocument] = await tx.select({
      id: document.id,
      storageKey: document.storageKey,
    })
      .from(document)
      .where(and(
        eq(document.id, input.documentId),
        eq(document.organizationId, input.organizationId),
      ))
      .limit(1)
      .for('update')
    if (!lockedDocument) return null
    await enqueueDocumentErasure(tx, {
      organizationId: input.organizationId,
      storageKey: lockedDocument.storageKey,
    })
    const [deletedDocument] = await tx.delete(document)
      .where(and(
        eq(document.id, input.documentId),
        eq(document.organizationId, input.organizationId),
      ))
      .returning({ id: document.id })
    return deletedDocument ?? null
  })
}

const defaultAdapter: DocumentDeletionAdapter = {
  deleteRelationalRecord: deleteDocumentRelationalRecordWithProcessingHistory,
}

export async function deleteDocumentWithProcessingHistory(
  input: { organizationId: string; documentId: string },
  adapter: DocumentDeletionAdapter = defaultAdapter,
): Promise<DocumentDeletionResult | null> {
  return adapter.deleteRelationalRecord(input)
}
