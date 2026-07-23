export type ListPageSummary = {
  totalPages: number
  from: number
  to: number
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`)
  }
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer`)
  }
}

export function getListPageSummary(
  total: number,
  page: number,
  limit: number,
): ListPageSummary {
  assertNonNegativeInteger(total, 'total')
  assertPositiveInteger(page, 'page')
  assertPositiveInteger(limit, 'limit')

  const totalPages = Math.max(1, Math.ceil(total / limit))
  if (total === 0) {
    return { totalPages, from: 0, to: 0 }
  }

  const displayedPage = Math.min(page, totalPages)
  return {
    totalPages,
    from: (displayedPage - 1) * limit + 1,
    to: Math.min(displayedPage * limit, total),
  }
}
