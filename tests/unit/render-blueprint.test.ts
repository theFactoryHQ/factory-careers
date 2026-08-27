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

  it('matches the live Starter service and waits for required checks', () => {
    expect(source).toMatch(/plan: starter/)
    expect(source).toMatch(/autoDeployTrigger: checksPass/)
    expect(source).not.toMatch(/plan: free/)
  })

  it('keeps migrations enabled and opt-in workers disabled for the safe rollout', () => {
    expect(source).toMatch(/key: SKIP_RUNTIME_MIGRATIONS\s+value: "false"/)
    expect(source).toMatch(/key: RECRUITING_WORKER_ENABLED\s+value: "false"/)
    expect(source).toMatch(/key: DOCUMENT_ERASURE_WORKER_ENABLED\s+value: "false"/)
  })

  it('trusts Render-owned forwarding headers for production rate-limit identity', () => {
    expect(source).toMatch(/key: TRUST_PROXY_HEADERS\s+value: "true"/)
  })

  it('keeps production Microsoft Calendar in app-only mode', () => {
    expect(source).toContain('key: MICROSOFT_CALENDAR_AUTH_MODE')
    expect(source).toContain('value: application')
  })

  it('keeps the production SSO mode and operations secrets explicitly managed', () => {
    expect(source).toMatch(/key: SSO_PROVIDER_SECRET_STORAGE_MODE\s+sync: false/)
    expect(source).toMatch(/key: CRON_SECRET\s+sync: false/)
    expect(source).toMatch(/key: FACTORY_CAREERS_OPERATIONS_INBOX\s+sync: false/)
    expect(source).toMatch(/key: FACTORY_CAREERS_SSO_PROVIDER_ID\s+value: thefactoryhq-sso/)
  })
})
