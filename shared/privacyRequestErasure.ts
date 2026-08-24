export type PrivacyRequestErasureQueueStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type PrivacyRequestErasureSummary = {
  state: 'none' | 'pending' | 'failed' | 'completed'
  totalCount: number
  outstandingCount: number
}

export function buildPrivacyRequestErasureSummary(
  rows: Array<{ status: PrivacyRequestErasureQueueStatus; count: number }>,
): PrivacyRequestErasureSummary {
  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 }
  for (const row of rows) counts[row.status] += row.count
  const totalCount = counts.pending + counts.processing + counts.completed + counts.failed
  const outstandingCount = counts.pending + counts.processing + counts.failed
  const state = totalCount === 0
    ? 'none'
    : counts.failed > 0
      ? 'failed'
      : outstandingCount > 0
        ? 'pending'
        : 'completed'
  return { state, totalCount, outstandingCount }
}

export function getPrivacyRequestErasureNotice(
  summary: PrivacyRequestErasureSummary,
): string | null {
  if (summary.outstandingCount === 0) return null
  const objects = `${summary.outstandingCount} ${summary.outstandingCount === 1 ? 'object' : 'objects'}`
  return summary.state === 'failed'
    ? `Private document erasure requires attention for ${objects}.`
    : `Private document erasure is still pending for ${objects}.`
}
