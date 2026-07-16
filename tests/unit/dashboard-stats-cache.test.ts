import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('dashboard stats cache', () => {
  const stats = readFileSync(
    join(process.cwd(), 'server/api/dashboard/stats.get.ts'),
    'utf8',
  )

  it('authorizes dashboard stats before calling the shared org-scoped data cache', () => {
    expect(stats).toContain('defineOrgScopedCachedFunction')
    expect(stats).toContain('defineEventHandler')
    expect(stats.indexOf('requirePermission')).toBeLessThan(
      stats.indexOf('return getCachedDashboardStats'),
    )
    expect(stats).not.toContain('defineCachedEventHandler')
  })
})
