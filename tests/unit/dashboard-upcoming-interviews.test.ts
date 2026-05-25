import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('dashboard upcoming interviews', () => {
  const source = readFileSync(join(process.cwd(), 'app/pages/dashboard/index.vue'), 'utf8')

  it('queries upcoming interviews from a current-time window, not the start of the day', () => {
    expect(source).not.toContain('from: today.toISOString()')
    expect(source).toContain("useState('dashboard-upcoming-interviews-query-from'")
    expect(source).toContain('from: dashboardInterviewQueryFromIso')
    expect(source).toContain('to: dashboardInterviewQueryToIso')
  })

  it('keeps the interview fetch key stable while refreshing relative times', () => {
    expect(source).toContain('dashboardInterviewQueryFromIso.value = mountedAtIso')
    expect(source).not.toMatch(/setInterval\(\(\) => \{\s*dashboardInterviewQueryFromIso\.value = new Date\(\)\.toISOString\(\)/)
  })

  it('filters stale cached interviews before rendering the upcoming card', () => {
    expect(source).toContain('upcomingInterviewsForCard')
    expect(source).toMatch(/new Date\(interview\.scheduledAt\)\.getTime\(\) >= dashboardNow\.value\.getTime\(\)/)
    expect(source).toMatch(/v-for="interview in upcomingInterviewsForCard"/)
  })

  it('refreshes its current-time boundary while the dashboard stays open', () => {
    expect(source).toContain('dashboardNowTimer = setInterval')
    expect(source).toContain('dashboardNowIso.value = new Date().toISOString()')
    expect(source).toContain('if (dashboardNowTimer) clearInterval(dashboardNowTimer)')
  })

  it('never formats upcoming interview relative dates as negative days', () => {
    expect(source).toContain("if (diffMs <= 0) return 'Now'")
    expect(source).not.toContain("if (diffHours <= 0) return 'Now'")
  })

  it('keeps dashboard stat cards compact before the desktop breakpoint', () => {
    expect(source).toContain('<DashboardStatCard')
    expect(source).toContain('padding-class="p-3 sm:p-4 lg:p-6"')
    expect(source).toContain('text-2xl sm:text-3xl lg:text-4xl')
    expect(source).toContain('label-class="mt-2 lg:mt-3"')
    expect(source).toContain('size-16 sm:size-20 lg:size-24')
    expect(source).not.toContain('ui-dashboard-stat-card p-5 sm:p-6')
  })
})
