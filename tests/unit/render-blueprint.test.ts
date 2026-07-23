import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Render blueprint', () => {
  const source = readFileSync(join(process.cwd(), 'render.yaml'), 'utf8')

  it('deploys the Factory-owned repository and uses the readiness endpoint', () => {
    expect(source).toContain('repo: https://github.com/theFactoryHQ/factory-careers')
    expect(source).toContain('healthCheckPath: /api/readyz')
    expect(source).not.toContain('repo: https://github.com/caffeinebounce/factory-careers')
  })

  it('keeps migrations enabled and the recruiting worker disabled for the safe rollout', () => {
    expect(source).toMatch(/key: SKIP_RUNTIME_MIGRATIONS\s+value: "false"/)
    expect(source).toMatch(/key: RECRUITING_WORKER_ENABLED\s+value: "false"/)
  })

  it('trusts Render-owned forwarding headers for production rate-limit identity', () => {
    expect(source).toMatch(/key: TRUST_PROXY_HEADERS\s+value: "true"/)
  })

  it('keeps production Microsoft Calendar in app-only mode', () => {
    expect(source).toContain('key: MICROSOFT_CALENDAR_AUTH_MODE')
    expect(source).toContain('value: application')
  })
})
