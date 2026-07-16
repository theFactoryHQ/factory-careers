import { eq, and } from 'drizzle-orm'
import { candidate } from '../../database/schema'
import {
  prepareCandidateProcessingCascadeInTransaction,
} from '../../utils/processingCascadeCleanup'
import type { ProcessingQueueDatabaseExecutor } from '../../utils/processingQueue'
import { candidateIdParamSchema } from '../../utils/schemas/candidate'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { candidate: ['delete'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, candidateIdParamSchema.parse)

  const deletion = await db.transaction(async (tx) => {
    const cascade = await prepareCandidateProcessingCascadeInTransaction(
      tx as unknown as ProcessingQueueDatabaseExecutor,
      { organizationId: orgId, candidateIds: [id] },
    )
    if (cascade.candidateIds.length === 0) return null
    const [deleted] = await tx.delete(candidate)
      .where(and(eq(candidate.id, id), eq(candidate.organizationId, orgId)))
      .returning({ id: candidate.id })
    return deleted ? { deleted, cascade } : null
  })

  if (!deletion) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const storageResults = await Promise.allSettled(
    deletion.cascade.documents.map(doc => deleteFromS3(doc.storageKey)),
  )
  const failedStorageDeletes = storageResults.filter(result => result.status === 'rejected').length
  if (failedStorageDeletes > 0) {
    logWarn('candidate.document_s3_delete_failed', {
      result_code: 'storage_cleanup_failed',
      failed_count: failedStorageDeletes,
    })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'candidate',
    resourceId: id,
    metadata: { deletedDocumentCount: deletion.cascade.documents.length },
  })

  await invalidateOrgScopedDashboardCache(event)

  setResponseStatus(event, 204)
  return null
})
