import { eq, and, isNull } from 'drizzle-orm'
import { resourceIdParamSchema } from '../../../utils/schemas/common'
import { application, job } from '../../../database/schema'
import {
  enqueueProcessingBatch,
  getProcessingBatchStatus,
} from '../../../utils/processingQueue'
import { processingBatchResponse } from '../../../utils/processingResponse'
import { createRateLimiter } from '../../../utils/rateLimit'

const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  message: 'Too many bulk analysis requests. Please wait before retrying.',
})

/**
 * POST /api/jobs/:id/analyze-all
 * Queue AI analysis for all currently unscored applications for a job.
 */
export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, resourceIdParamSchema.parse)

  // Verify job belongs to org
  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRecord) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }

  // Find all applications without scores
  const unscoredApps = await db.select({
    id: application.id,
  })
    .from(application)
    .where(and(
      eq(application.jobId, jobId),
      eq(application.organizationId, orgId),
      isNull(application.score),
    ))

  const { batch } = await enqueueProcessingBatch({
    organizationId: orgId,
    type: 'application_analysis',
    resourceIds: unscoredApps.map(row => row.id),
  })
  const status = await getProcessingBatchStatus({ organizationId: orgId, batchId: batch.id })
  if (!status) throw createError({ statusCode: 500, statusMessage: 'Processing batch was not created' })

  setResponseStatus(event, 202)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'Location', `/api/processing/${encodeURIComponent(batch.id)}`)
  if (status.retryAfterMs !== null) {
    setResponseHeader(event, 'Retry-After', Math.max(1, Math.ceil(status.retryAfterMs / 1_000)))
  }
  return processingBatchResponse(status)
})
