/** Build bounded-concurrency batches for every API page after page one. */
export function remainingPageBatches(total: number, limit: number, concurrency = 4): number[][] {
  const batchSize = Math.floor(concurrency)
  if (
    !Number.isFinite(total)
    || !Number.isFinite(limit)
    || !Number.isFinite(concurrency)
    || total <= 0
    || limit <= 0
    || batchSize <= 0
    || total <= limit
  ) return []

  const remainingPages = Array.from(
    { length: Math.ceil(total / limit) - 1 },
    (_, index) => index + 2,
  )
  const batches: number[][] = []

  for (let index = 0; index < remainingPages.length; index += batchSize) {
    batches.push(remainingPages.slice(index, index + batchSize))
  }

  return batches
}
