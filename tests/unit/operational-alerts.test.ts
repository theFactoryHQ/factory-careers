import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  criticalHttpErrorAlertCode,
  isExpectedHealthCheckUnready,
  shouldDispatchCriticalAlert,
} from '../../server/utils/operationalAlerts'

describe('critical operational alert throttling', () => {
  it('alerts immediately, suppresses repeats, and allows a later incident', () => {
    const now = new Date('2026-08-14T12:00:00.000Z')
    expect(shouldDispatchCriticalAlert(null, now)).toBe(true)
    expect(shouldDispatchCriticalAlert(new Date('2026-08-14T11:50:01.000Z'), now)).toBe(false)
    expect(shouldDispatchCriticalAlert(new Date('2026-08-14T11:44:59.000Z'), now)).toBe(true)
  })
})

describe('HTTP error operational alerts', () => {
  it('treats /api/readyz 503 as the expected hosting health-check signal', () => {
    expect(isExpectedHealthCheckUnready('/api/readyz', 503)).toBe(true)
    expect(criticalHttpErrorAlertCode('/api/readyz', 503)).toBeUndefined()
    expect(criticalHttpErrorAlertCode('/api/readyz', 500)).toBeUndefined()
  })

  it('pages only unexpected public application 5xx failures', () => {
    expect(criticalHttpErrorAlertCode('/api/public/jobs/general-interest/apply', 500))
      .toBe('application.request_failed')
    expect(criticalHttpErrorAlertCode('/api/public/jobs/general-interest/apply', 503))
      .toBe('application.request_failed')
    expect(criticalHttpErrorAlertCode('/api/public/jobs/general-interest/apply', 400))
      .toBeUndefined()
    expect(criticalHttpErrorAlertCode('/api/operations/sso-health', 500)).toBeUndefined()
  })

  it('does not send readiness.request_failed from the PostHog error hook', () => {
    const source = readFileSync(join(process.cwd(), 'server/plugins/posthog.ts'), 'utf8')
    expect(source).toContain('criticalHttpErrorAlertCode')
    expect(source).toContain('isExpectedHealthCheckUnready')
    expect(source).not.toContain('readiness.request_failed')
  })
})
