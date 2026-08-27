import { eq, and } from 'drizzle-orm'
import { candidate } from '../../database/schema'
import {
  prepareCandidateProcessingCascadeInTransaction,
} from '../../utils/processingCascadeCleanup'
import type { ProcessingQueueDatabaseExecutor } from '../../utils/processingQueue'
import { enqueueDocumentErasure } from '../../utils/documentErasureQueue'
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
    for (const doc of cascade.documents) {
      await enqueueDocumentErasure(tx, {
        organizationId: orgId,
        storageKey: doc.storageKey,
      })
    }
    const [deleted] = await tx.delete(candidate)
      .where(and(eq(candidate.id, id), eq(candidate.organizationId, orgId)))
      .returning({ id: candidate.id })
    return deleted ? { deleted, cascade } : null
  })

  if (!deletion) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
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
