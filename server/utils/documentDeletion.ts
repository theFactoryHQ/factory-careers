import { and, eq } from 'drizzle-orm'
import { document } from '../database/schema'
import { db } from './db'
import { logWarn } from './logger'
import {
  cancelDocumentProcessingTasksInTransaction,
  type ProcessingQueueDatabaseExecutor,
} from './processingQueue'
import { deleteFromS3 } from './s3'

export type DocumentDeletionResult = {
  id: string
  storageKey: string
}

export type DocumentDeletionAdapter = {
  deleteRelationalRecord(input: {
    organizationId: string
    documentId: string
  }): Promise<DocumentDeletionResult | null>
  deleteStorageObject(storageKey: string): Promise<void>
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
    const [deletedDocument] = await tx.delete(document)
      .where(and(
        eq(document.id, input.documentId),
        eq(document.organizationId, input.organizationId),
      ))
      .returning({ id: document.id, storageKey: document.storageKey })
    return deletedDocument ?? null
  })
}

const defaultAdapter: DocumentDeletionAdapter = {
  deleteRelationalRecord: deleteDocumentRelationalRecordWithProcessingHistory,
  deleteStorageObject: deleteFromS3,
}

export async function deleteDocumentWithProcessingHistory(
  input: { organizationId: string; documentId: string },
  adapter: DocumentDeletionAdapter = defaultAdapter,
): Promise<DocumentDeletionResult | null> {
  const deletedDocument = await adapter.deleteRelationalRecord(input)
  if (!deletedDocument) return null
  try {
    await adapter.deleteStorageObject(deletedDocument.storageKey)
  }
  catch {
    logWarn('document.s3_delete_failed', { result_code: 'storage_cleanup_failed' })
  }
  return deletedDocument
}
