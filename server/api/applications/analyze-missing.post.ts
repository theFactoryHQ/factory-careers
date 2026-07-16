import { and, eq, isNull } from 'drizzle-orm'
import { application } from '../../database/schema'
import {
  enqueueProcessingBatch,
  getProcessingBatchStatus,
} from '../../utils/processingQueue'
import { processingBatchResponse } from '../../utils/processingResponse'
import { createRateLimiter } from '../../utils/rateLimit'

const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  message: 'Too many bulk analysis requests. Please wait before retrying.',
})

/** Queue analysis for every currently unscored application in the organization. */
export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { scoring: ['create'] })
  const organizationId = session.session.activeOrganizationId
  const applicationRows = await db.select({ id: application.id })
    .from(application)
    .where(and(
      eq(application.organizationId, organizationId),
      isNull(application.score),
    ))

  const { batch } = await enqueueProcessingBatch({
    organizationId,
    type: 'application_analysis',
    resourceIds: applicationRows.map(row => row.id),
  })
  const status = await getProcessingBatchStatus({ organizationId, batchId: batch.id })
  if (!status) throw createError({ statusCode: 500, statusMessage: 'Processing batch was not created' })

  setResponseStatus(event, 202)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'Location', `/api/processing/${encodeURIComponent(batch.id)}`)
  if (status.retryAfterMs !== null) {
    setResponseHeader(event, 'Retry-After', Math.max(1, Math.ceil(status.retryAfterMs / 1_000)))
  }
  return processingBatchResponse(status)
})
