import { getProcessingBatchStatus } from '../../utils/processingQueue'
import { processingBatchResponse } from '../../utils/processingResponse'
import { resourceIdParamSchema } from '../../utils/schemas/common'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['read'] })
  const organizationId = session.session.activeOrganizationId
  const { id: batchId } = await getValidatedRouterParams(event, resourceIdParamSchema.parse)
  const status = await getProcessingBatchStatus({ organizationId, batchId })
  if (!status) throw createError({ statusCode: 404, statusMessage: 'Processing batch not found' })

  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (status.retryAfterMs !== null) {
    setResponseHeader(event, 'Retry-After', Math.max(1, Math.ceil(status.retryAfterMs / 1_000)))
  }
  return processingBatchResponse(status)
})
