import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

const MUTATION_HANDLERS_WITH_INVALIDATION = [
  'server/api/jobs/index.post.ts',
  'server/api/jobs/[id].patch.ts',
  'server/api/jobs/[id].delete.ts',
  'server/api/candidates/index.post.ts',
  'server/api/candidates/[id].patch.ts',
  'server/api/candidates/[id].delete.ts',
  'server/api/applications/index.post.ts',
  'server/api/applications/[id].patch.ts',
  'server/api/interviews/index.post.ts',
  'server/api/interviews/[id]/index.patch.ts',
  'server/api/interviews/[id]/index.delete.ts',
  'server/api/public/jobs/[slug]/apply.post.ts',
]

describe('org-scoped dashboard cache invalidation on writes', () => {
  it.each(MUTATION_HANDLERS_WITH_INVALIDATION)('%s invalidates dashboard list caches', (file) => {
    const source = readProjectFile(file)
    const expectsEventInvalidation = !file.includes('public/jobs')
    if (expectsEventInvalidation) {
      expect(source, file).toContain('invalidateOrgScopedDashboardCache(event)')
    } else {
      expect(source, file).toContain('invalidateOrgScopedDashboardCacheForOrg(orgId)')
    }
  })
})