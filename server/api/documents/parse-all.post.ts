import { and, eq } from 'drizzle-orm'
import { document } from '../../database/schema'
import {
  enqueueProcessingBatch,
  getProcessingBatchStatus,
} from '../../utils/processingQueue'
import { processingBatchResponse } from '../../utils/processingResponse'
import { createRateLimiter } from '../../utils/rateLimit'

const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  message: 'Too many bulk parsing requests. Please wait before retrying.',
})

/** Queue every uploaded document whose parse state is currently retryable/pending. */
export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { document: ['update'] })
  const organizationId = session.session.activeOrganizationId
  const documentRows = await db.select({ id: document.id })
    .from(document)
    .where(and(
      eq(document.organizationId, organizationId),
      eq(document.uploadStatus, 'completed'),
      eq(document.parseStatus, 'pending'),
    ))

  const { batch } = await enqueueProcessingBatch({
    organizationId,
    type: 'document_parse',
    resourceIds: documentRows.map(row => row.id),
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
