import type { ProcessingBatchStatus } from './processingQueue'

export function processingBatchResponse(status: ProcessingBatchStatus) {
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
