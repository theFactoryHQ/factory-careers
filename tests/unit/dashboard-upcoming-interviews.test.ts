import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('dashboard upcoming interviews', () => {
  const source = readFileSync(join(process.cwd(), 'app/pages/dashboard/index.vue'), 'utf8')

  it('queries upcoming interviews from the current time, not the start of the day', () => {
    expect(source).not.toContain('from: today.toISOString()')
    expect(source).toContain('from: dashboardNowIso')
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
})
