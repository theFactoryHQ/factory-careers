/** Build bounded-concurrency batches for every API page after page one. */
export function remainingPageBatches(total: number, limit: number, concurrency = 4): number[][] {
  if (total <= limit || limit <= 0 || concurrency <= 0) return []

  const remainingPages = Array.from(
    { length: Math.ceil(total / limit) - 1 },
    (_, index) => index + 2,
  )
  const batches: number[][] = []

  for (let index = 0; index < remainingPages.length; index += concurrency) {
    batches.push(remainingPages.slice(index, index + concurrency))
  }

  return batches
}
