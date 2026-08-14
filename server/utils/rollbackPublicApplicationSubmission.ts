import { and, eq, sql } from 'drizzle-orm'
import { application, candidate, document } from '../database/schema'
import { db } from './db'
import { logError, logWarn } from './logger'
import {
  cancelProcessingTasksInTransaction,
  type ProcessingQueueDatabaseExecutor,
  type ProcessingTaskTarget,
} from './processingQueue'
import { deleteFromS3 } from './s3'

export type PublicApplicationRollbackInput = {
  applicationId: string
  candidateId?: string
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
      const applicationDocuments = await tx.select({ id: document.id })
        .from(document)
        .where(and(
          eq(document.applicationId, input.applicationId),
          eq(document.organizationId, input.organizationId),
        ))
      const documentTargets: ProcessingTaskTarget[] = applicationDocuments.flatMap(
        candidateDocument => [
          { type: 'document_parse', resourceId: candidateDocument.id },
          { type: 'document_upload_reconciliation', resourceId: candidateDocument.id },
        ],
      )
      await cancelProcessingTasksInTransaction(
        tx as unknown as ProcessingQueueDatabaseExecutor,
        {
          organizationId: input.organizationId,
          targets: [
            ...documentTargets,
            { type: 'application_analysis', resourceId: input.applicationId },
          ],
          resultCode: 'resource_removed',
        },
      )
      // The application resource lock above prevents a new application or
      // associated-document enqueue from crossing this point. Re-read the
      // document set after that boundary, then lock/cancel every final member.
      const stableApplicationDocuments = await tx.select({ id: document.id })
        .from(document)
        .where(and(
          eq(document.applicationId, input.applicationId),
          eq(document.organizationId, input.organizationId),
        ))
        .orderBy(document.id)
      await cancelProcessingTasksInTransaction(
        tx as unknown as ProcessingQueueDatabaseExecutor,
        {
          organizationId: input.organizationId,
          targets: stableApplicationDocuments.flatMap(candidateDocument => [
            { type: 'document_parse' as const, resourceId: candidateDocument.id },
            {
              type: 'document_upload_reconciliation' as const,
              resourceId: candidateDocument.id,
            },
          ]),
          resultCode: 'resource_removed',
        },
      )
      const [lockedApplication] = await tx.select({ id: application.id })
        .from(application)
        .where(and(
          eq(application.id, input.applicationId),
          eq(application.organizationId, input.organizationId),
        ))
        .limit(1)
        .for('update')
      if (!lockedApplication) return
      await tx.select({ id: document.id })
        .from(document)
        .where(and(
          eq(document.applicationId, input.applicationId),
          eq(document.organizationId, input.organizationId),
        ))
        .orderBy(document.id)
        .for('update')
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
      if (input.candidateId) {
        await tx.delete(candidate)
          .where(and(
            eq(candidate.id, input.candidateId),
            eq(candidate.organizationId, input.organizationId),
            sql`NOT EXISTS (SELECT 1 FROM ${application} WHERE ${application.candidateId} = ${candidate.id})`,
            sql`NOT EXISTS (SELECT 1 FROM ${document} WHERE ${document.candidateId} = ${candidate.id})`,
          ))
      }
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
): Promise<{ relationalCleanupSucceeded: boolean, storageCleanupSucceeded: boolean }> {
  try {
    await adapter.cleanupRelationalRecords({
      applicationId: input.applicationId,
      organizationId: input.organizationId,
    })
  } catch {
    logError('application.rollback_failed', {
      result_code: 'relational_cleanup_failed',
    })
    return { relationalCleanupSucceeded: false, storageCleanupSucceeded: false }
  }

  const storageKeys = [...new Set(input.storageKeys)]
  const cleanupResults = await Promise.allSettled(
    storageKeys.map(storageKey => adapter.deleteStorageObject(storageKey)),
  )

  cleanupResults.forEach((result) => {
    if (result.status === 'rejected') {
      logWarn('application.rollback_s3_cleanup_failed', {
        result_code: 'storage_cleanup_failed',
      })
    }
  })

  return {
    relationalCleanupSucceeded: true,
    storageCleanupSucceeded: cleanupResults.every(result => result.status === 'fulfilled'),
  }
}
