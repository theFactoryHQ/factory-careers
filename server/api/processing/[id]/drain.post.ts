import { z } from 'zod'
import { processRecruitingTasks } from '../../../utils/processRecruitingTasks'
import { getProcessingBatchStatus } from '../../../utils/processingQueue'
import { processingBatchResponse } from '../../../utils/processingResponse'
import { createRateLimiter } from '../../../utils/rateLimit'
import { resourceIdParamSchema } from '../../../utils/schemas/common'

const bodySchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
}).strict().default({ limit: 10 })

const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  message: 'Too many processing requests. Please wait before retrying.',
})

export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { organization: ['read'] })
  const organizationId = session.session.activeOrganizationId
  const { id: batchId } = await getValidatedRouterParams(event, resourceIdParamSchema.parse)
  const body = bodySchema.parse(await readBody(event))
  const existing = await getProcessingBatchStatus({ organizationId, batchId })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Processing batch not found' })
  if (existing.type === 'application_analysis') {
    await requirePermission(event, { scoring: ['create'] })
  }
  else {
    await requirePermission(event, { document: ['update'] })
  }

  if (!['completed', 'failed', 'cancelled'].includes(existing.status)) {
    await processRecruitingTasks({
      organizationId,
      batchId,
      limit: body.limit,
      types: [existing.type],
    })
  }

  const status = await getProcessingBatchStatus({ organizationId, batchId })
  if (!status) throw createError({ statusCode: 404, statusMessage: 'Processing batch not found' })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (status.retryAfterMs !== null) {
    setResponseHeader(event, 'Retry-After', Math.max(1, Math.ceil(status.retryAfterMs / 1_000)))
  }
  return processingBatchResponse(status)
})
