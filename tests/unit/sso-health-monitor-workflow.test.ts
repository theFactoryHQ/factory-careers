import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Microsoft production monitor workflow', () => {
  const source = readFileSync('.github/workflows/sso-health-monitor.yml', 'utf8')
  it('runs both checks on a schedule and never prints provider responses', () => {
    expect(source).toContain("- cron: '*/15 * * * *'")
    expect(source).toContain('workflow_dispatch:')
    expect(source).toContain("['sso', 'calendar']")
    expect(source).toMatch(/issues:\s+write/)
    expect(source).toContain('secrets.FACTORY_CAREERS_CRON_SECRET')
    expect(source).not.toContain('createComment')
  })
})
