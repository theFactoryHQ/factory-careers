export const processingTaskTypes = [
  'application_analysis',
  'document_parse',
  'document_upload_reconciliation',
] as const

export const processingBatchStatuses = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const

export type ProcessingTaskType = typeof processingTaskTypes[number]
export type ProcessingBatchStatusName = typeof processingBatchStatuses[number]

export type ProcessingBatchResponse = {
  batchId: string
  type: ProcessingTaskType
  status: ProcessingBatchStatusName
  counts: {
    pending: number
    processing: number
    succeeded: number
    failed: number
    cancelled: number
    attempted: number
    total: number
  }
  errorsByCode: Record<string, number>
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  retryAfterMs: number | null
}

export function isProcessingBatchTerminal(status: ProcessingBatchStatusName): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}
