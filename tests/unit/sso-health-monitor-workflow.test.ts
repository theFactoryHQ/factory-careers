import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('SSO health monitor workflow', () => {
  const source = readFileSync(
    join(process.cwd(), '.github/workflows/sso-health-monitor.yml'),
    'utf8',
  )

  it('runs every fifteen minutes and supports a manual proof run', () => {
    expect(source).toContain("- cron: '*/15 * * * *'")
    expect(source).toContain('workflow_dispatch:')
    expect(source).toMatch(/issues:\s+write/)
  })

  it('uses secret-backed production routing and never prints response bodies', () => {
    expect(source).toContain('FACTORY_CAREERS_PRODUCTION_URL: ${{ secrets.FACTORY_CAREERS_PRODUCTION_URL }}')
    expect(source).toContain('FACTORY_CAREERS_CRON_SECRET: ${{ secrets.FACTORY_CAREERS_CRON_SECRET }}')
    expect(source).toContain('--output "$RUNNER_TEMP/sso-health.json"')
    expect(source).not.toMatch(/cat\s+[^\n]*sso-health\.json/)
    expect(source).not.toContain('set -x')
  })

  it('alerts immediate failures once and requires two transient failures', () => {
    expect(source).toContain('sleep 60')
    expect(source).toContain("firstCode === 'transient_failure'")
    expect(source).toContain("secondCode === 'transient_failure'")
    expect(source).toContain('invalid_client')
    expect(source).toContain('metadata_missing')
    expect(source).toContain('incident:sso')
    expect(source).toContain('factory-careers-sso-health')
  })
})
