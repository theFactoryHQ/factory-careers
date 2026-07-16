import { and, eq, gte, isNull, lte, or } from 'drizzle-orm'
import { job } from '../database/schema'

type PublicJobVisibilityOptions = {
  /** Compatibility escape hatch for databases created before active_from existed. */
  includeActiveFrom?: boolean
}

/**
 * Builds the canonical visibility predicate for anonymous job-board reads and
 * application submissions.
 */
export function getPublicJobVisibilityCondition(
  now = new Date(),
  { includeActiveFrom = true }: PublicJobVisibilityOptions = {},
) {
  return and(
    eq(job.status, 'open'),
    includeActiveFrom ? lte(job.activeFrom, now) : undefined,
    or(isNull(job.validThrough), gte(job.validThrough, now))!,
  )!
}
