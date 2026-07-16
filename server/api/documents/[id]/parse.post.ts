import { and, eq } from 'drizzle-orm'
import { document } from '../../../database/schema'
import {
  cancelProcessingTasksInTransaction,
  enqueueProcessingTaskInTransaction,
  getProcessingBatchStatus,
  type ProcessingQueueDatabaseExecutor,
} from '../../../utils/processingQueue'
import { processingBatchResponse } from '../../../utils/processingResponse'
import { createRateLimiter } from '../../../utils/rateLimit'
import { resourceIdParamSchema } from '../../../utils/schemas/common'

const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
  message: 'Too many document parsing requests. Please wait before retrying.',
})

/** Reset one uploaded document and queue a fresh parse attempt atomically. */
export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { document: ['update'] })
  const organizationId = session.session.activeOrganizationId
  const { id: documentId } = await getValidatedRouterParams(event, resourceIdParamSchema.parse)

  const { batchId } = await db.transaction(async (tx) => {
    const [candidateDocument] = await tx.select({
      id: document.id,
      uploadStatus: document.uploadStatus,
    })
      .from(document)
      .where(and(
        eq(document.id, documentId),
        eq(document.organizationId, organizationId),
      ))
      .limit(1)
    if (!candidateDocument) {
      throw createError({ statusCode: 404, statusMessage: 'Document not found' })
    }
    if (candidateDocument.uploadStatus !== 'completed') {
      throw createError({ statusCode: 409, statusMessage: 'Document upload is not complete' })
    }

    const executor = tx as unknown as ProcessingQueueDatabaseExecutor
    const cancelled = await cancelProcessingTasksInTransaction(executor, {
      organizationId,
      targets: [{ type: 'document_parse', resourceId: documentId }],
      resultCode: 'manual_reparse',
    })
    const queued = await enqueueProcessingTaskInTransaction(
      executor,
      {
        organizationId,
        type: 'document_parse',
        resourceId: documentId,
      },
    )
    if (cancelled.some(task => task.id === queued.task.id)) {
      throw new Error('Manual reparse did not create a fresh processing task')
    }
    await tx.update(document)
      .set({
        parsedContent: null,
        parseStatus: 'pending',
        parseResultCode: null,
        parseRetryable: null,
        parseAttemptedAt: null,
      })
      .where(and(
        eq(document.id, documentId),
        eq(document.organizationId, organizationId),
      ))
    return queued
  })

  const status = await getProcessingBatchStatus({ organizationId, batchId })
  if (!status) throw createError({ statusCode: 500, statusMessage: 'Processing batch was not created' })
  setResponseStatus(event, 202)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'Location', `/api/processing/${encodeURIComponent(batchId)}`)
  if (status.retryAfterMs !== null) {
    setResponseHeader(event, 'Retry-After', Math.max(1, Math.ceil(status.retryAfterMs / 1_000)))
  }
  return processingBatchResponse(status)
})
