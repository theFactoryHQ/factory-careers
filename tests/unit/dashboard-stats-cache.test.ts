import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('dashboard stats cache', () => {
  const stats = readFileSync(join(process.cwd(), 'server/api/dashboard/stats.get.ts'), 'utf8')
  const httpCache = readFileSync(join(process.cwd(), 'server/utils/httpCache.ts'), 'utf8')

  it('routes dashboard stats through the shared org-scoped cache helper', () => {
    expect(stats).toContain('defineCachedEventHandler')
    expect(stats).toContain('orgScopedCacheOptions')
  })

  it('varies by cookie and bearer tokens so the cached handler preserves auth headers', () => {
    expect(httpCache).toContain("varies: ['cookie', 'authorization']")
  })
})
