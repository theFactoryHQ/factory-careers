import type { ProcessingBatchStatus } from './processingQueue'
import type { ProcessingBatchResponse } from '../../shared/processing-batch'

export function processingBatchResponse(status: ProcessingBatchStatus): ProcessingBatchResponse {
  return {
    batchId: status.batchId,
    type: status.type,
    status: status.status,
    counts: status.counts,
    errorsByCode: status.errorsByCode,
    createdAt: status.timestamps.createdAt.toISOString(),
    startedAt: status.timestamps.startedAt?.toISOString() ?? null,
    completedAt: status.timestamps.completedAt?.toISOString() ?? null,
    retryAfterMs: status.retryAfterMs,
  }
}
