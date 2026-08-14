import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('application monitoring workflows', () => {
  it('checks all public entry points every five minutes and reconciles one incident', () => {
    const workflow = read('.github/workflows/application-health-monitor.yml')
    expect(workflow).toContain("cron: '*/5 * * * *'")
    expect(workflow).toContain('/api/readyz')
    expect(workflow).toContain('/api/public/jobs?limit=1')
    expect(workflow).toContain('/jobs/general-interest/apply')
    expect(workflow).toContain('https://thefactoryhq.com/careers')
    expect(workflow).toContain('incident:applications')
    expect(workflow).toContain('Retry after a short delay')
  })

  it('runs a full canary daily and after the exact production commit becomes live', () => {
    const workflow = read('.github/workflows/production-application-canary.yml')
    expect(workflow).toContain('workflow_run:')
    expect(workflow).toContain('Production deploy gate')
    expect(workflow).toContain("cron: '17 11 * * *'")
    expect(workflow).toContain('RENDER_API_KEY')
    expect(workflow).toContain('RENDER_SERVICE_ID')
    expect(workflow).toContain('/api/operations/application-canary')
  })
})
