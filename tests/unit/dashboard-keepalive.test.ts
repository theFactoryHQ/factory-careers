import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  dashboardKeepAliveMax,
  dashboardKeepAliveRouteNames,
  dashboardListPageKeepalive,
} from '../../shared/dashboard-keepalive'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

const dashboardListPages = [
  'app/pages/dashboard/jobs/index.vue',
  'app/pages/dashboard/candidates/index.vue',
  'app/pages/dashboard/applications/index.vue',
  'app/pages/dashboard/interviews/index.vue',
  'app/pages/dashboard/source-tracking/index.vue',
] as const

describe('dashboard list keepalive policy', () => {
  it('exports a shared keepalive flag and route name inventory', () => {
    expect(dashboardListPageKeepalive).toBe(true)
    expect(dashboardKeepAliveMax).toBe(5)
    expect(dashboardKeepAliveRouteNames).toEqual([
      'dashboard-jobs',
      'dashboard-candidates',
      'dashboard-applications',
      'dashboard-interviews',
      'dashboard-source-tracking',
    ])
  })

  it('enables keepalive on dashboard list index pages only', () => {
    for (const page of dashboardListPages) {
      const source = readProjectFile(page)
      expect(source, page).toContain('dashboardListPageKeepalive')
      expect(source, page).toContain('keepalive: dashboardListPageKeepalive')
    }
  })

  it('documents keepalive ownership in the dashboard layout', () => {
    const layout = readProjectFile('app/layouts/dashboard.vue')
    expect(layout).toContain('shared/dashboard-keepalive.ts')
    expect(layout).toContain('definePageMeta({ keepalive })')
  })

  it('does not keep the job pipeline route alive in v1', () => {
    const pipeline = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    expect(pipeline).not.toContain('keepalive')
  })
})