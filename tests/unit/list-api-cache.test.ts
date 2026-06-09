import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

const CACHED_LIST_HANDLERS = [
  'server/api/jobs/index.get.ts',
  'server/api/candidates/index.get.ts',
  'server/api/applications/index.get.ts',
  'server/api/interviews/index.get.ts',
  'server/api/dashboard/stats.get.ts',
]

describe('orgScopedCacheOptions', () => {
  const source = readProjectFile('server/utils/httpCache.ts')

  it('exports shared Nitro SWR defaults with session varies headers', () => {
    expect(source).toContain('orgScopedCacheOptions')
    expect(source).toContain('swr: true')
    expect(source).toContain("varies: ['cookie', 'authorization']")
    expect(source).toContain('ORG_SCOPED_CACHE_MAX_AGE_SECONDS')
  })

  it('scopes cache keys by organization and bumps generation on writes', () => {
    expect(source).toContain('ORG_SCOPED_DASHBOARD_CACHE_NAME')
    expect(source).toContain('async getKey(event: H3Event)')
    expect(source).toContain('bumpOrgDashboardCacheVersion')
    expect(source).toContain('invalidateOrgScopedDashboardCache')
    expect(source).toContain('invalidateOrgScopedDashboardCacheForOrg')
  })
})

describe('dashboard list API Nitro cache', () => {
  it.each(CACHED_LIST_HANDLERS)('%s uses defineCachedEventHandler with orgScopedCacheOptions', (file) => {
    const source = readProjectFile(file)
    expect(source, file).toContain('defineCachedEventHandler')
    expect(source, file).toContain('orgScopedCacheOptions')
    expect(source, file).toContain('requirePermission')
    expect(source, file).not.toMatch(/export default defineEventHandler\(/)
  })
})