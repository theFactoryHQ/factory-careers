import { eq, and } from 'drizzle-orm'
import { job } from '../../database/schema'
import { prepareJobProcessingCascadeInTransaction } from '../../utils/processingCascadeCleanup'
import type { ProcessingQueueDatabaseExecutor } from '../../utils/processingQueue'
import { idParamSchema } from '../../utils/schemas/job'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['delete'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)

  const deleted = await db.transaction(async (tx) => {
    const cascade = await prepareJobProcessingCascadeInTransaction(
      tx as unknown as ProcessingQueueDatabaseExecutor,
      { organizationId: orgId, jobId: id },
    )
    if (!cascade) return null
    const [row] = await tx.delete(job)
      .where(and(eq(job.id, id), eq(job.organizationId, orgId)))
      .returning({ id: job.id })
    return row ?? null
  })

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'job',
    resourceId: id,
  })

  await invalidateOrgScopedDashboardCache(event)

  setResponseStatus(event, 204)
  return null
})
