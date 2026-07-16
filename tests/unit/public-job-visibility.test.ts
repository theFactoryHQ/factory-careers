import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { getPublicJobVisibilityCondition } from '../../server/utils/publicJobVisibility'

const NOW = new Date('2026-07-16T12:00:00.000Z')

function evaluateVisibility(validThrough: Date | null) {
  const dialect = new PgDialect()
  const query = dialect.sqlToQuery(getPublicJobVisibilityCondition(NOW))
  expect(query.sql).toBe(
    '("job"."status" = $1 and "job"."active_from" <= $2 and ("job"."valid_through" is null or "job"."valid_through" >= $3))',
  )

  const [requiredStatus, activeFromCutoff, validThroughCutoff] = query.params as string[]
  const activeFrom = '2026-07-15T12:00:00.000Z'
  const validThroughValue = validThrough?.toISOString() ?? null

  return requiredStatus === 'open'
    && activeFrom <= activeFromCutoff!
    && (validThroughValue === null || validThroughValue >= validThroughCutoff!)
}

describe('public job visibility', () => {
  it('includes an open active job without a valid-through date', () => {
    expect(evaluateVisibility(null)).toBe(true)
  })

  it('includes an open active job with a future valid-through date', () => {
    expect(evaluateVisibility(new Date('2026-07-17T12:00:00.000Z'))).toBe(true)
  })

  it('includes an open active job through the exact valid-through instant', () => {
    expect(evaluateVisibility(NOW)).toBe(true)
  })

  it('excludes an open active job after its valid-through date', () => {
    expect(evaluateVisibility(new Date('2026-07-16T11:59:59.999Z'))).toBe(false)
  })

  it('uses the shared predicate in list, detail, and submission routes', () => {
    const routeFiles = [
      'server/api/public/jobs/index.get.ts',
      'server/api/public/jobs/[slug].get.ts',
      'server/api/public/jobs/[slug]/apply.post.ts',
    ]

    for (const routeFile of routeFiles) {
      const source = readFileSync(join(process.cwd(), routeFile), 'utf8')
      expect(source).toContain('getPublicJobVisibilityCondition')
    }
  })
})
