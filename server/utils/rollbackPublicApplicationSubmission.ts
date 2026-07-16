import { and, eq } from 'drizzle-orm'
import { application, document } from '../database/schema'
import { db } from './db'
import { logError, logWarn } from './logger'
import { deleteFromS3 } from './s3'

export type PublicApplicationRollbackInput = {
  applicationId: string
  organizationId: string
  storageKeys: string[]
}

export type PublicApplicationRollbackAdapter = {
  cleanupRelationalRecords(input: Omit<PublicApplicationRollbackInput, 'storageKeys'>): Promise<void>
  deleteStorageObject(storageKey: string): Promise<void>
}

const defaultAdapter: PublicApplicationRollbackAdapter = {
  async cleanupRelationalRecords(input) {
    await db.transaction(async (tx) => {
      await tx.delete(document)
        .where(and(
          eq(document.applicationId, input.applicationId),
          eq(document.organizationId, input.organizationId),
        ))

      await tx.delete(application)
        .where(and(
          eq(application.id, input.applicationId),
          eq(application.organizationId, input.organizationId),
        ))
    })
  },
  deleteStorageObject: deleteFromS3,
}

/**
 * Compensate for a failed application upload without creating dangling rows.
 * Relational cleanup commits atomically before any storage object is removed.
 */
export async function rollbackPublicApplicationSubmission(
  input: PublicApplicationRollbackInput,
  adapter: PublicApplicationRollbackAdapter = defaultAdapter,
): Promise<{ relationalCleanupSucceeded: boolean }> {
  try {
    await adapter.cleanupRelationalRecords({
      applicationId: input.applicationId,
      organizationId: input.organizationId,
    })
  } catch (rollbackError) {
    logError('application.rollback_failed', {
      application_id: input.applicationId,
      error_message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
    })
    return { relationalCleanupSucceeded: false }
  }

  const storageKeys = [...new Set(input.storageKeys)]
  const cleanupResults = await Promise.allSettled(
    storageKeys.map(storageKey => adapter.deleteStorageObject(storageKey)),
  )

  cleanupResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      const storageKey = storageKeys[index]!
      logWarn('application.rollback_s3_cleanup_failed', {
        application_id: input.applicationId,
        storage_key: storageKey,
        error_message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
  })

  return { relationalCleanupSucceeded: true }
}
