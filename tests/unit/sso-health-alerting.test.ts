import { describe, expect, it } from 'vitest'
import { deriveSsoHealthPersistence } from '../../server/utils/microsoftSsoHealth'

const NOW = new Date('2026-08-10T12:00:00.000Z')

describe('SSO health state-transition alerting', () => {
  it('alerts once when health changes to unhealthy', () => {
    const transition = deriveSsoHealthPersistence({
      previousStatus: 'healthy',
      previousAlertedAt: null,
      consecutiveTransientFailures: 0,
      result: { ok: false, code: 'invalid_client', checkedAt: NOW.toISOString() },
      now: NOW,
    })

    expect(transition.shouldAlert).toBe(true)
    expect(transition.consecutiveTransientFailures).toBe(0)
  })

  it('rate-limits repeated unhealthy alerts for 24 hours', () => {
    const recent = deriveSsoHealthPersistence({
      previousStatus: 'invalid_client',
      previousAlertedAt: new Date(NOW.getTime() - 23 * 60 * 60_000),
      consecutiveTransientFailures: 0,
      result: { ok: false, code: 'invalid_client', checkedAt: NOW.toISOString() },
      now: NOW,
    })
    const stale = deriveSsoHealthPersistence({
      previousStatus: 'invalid_client',
      previousAlertedAt: new Date(NOW.getTime() - 25 * 60 * 60_000),
      consecutiveTransientFailures: 0,
      result: { ok: false, code: 'invalid_client', checkedAt: NOW.toISOString() },
      now: NOW,
    })

    expect(recent.shouldAlert).toBe(false)
    expect(stale.shouldAlert).toBe(true)
  })

  it('increments transient failures and recovery permits a future transition alert', () => {
    const transient = deriveSsoHealthPersistence({
      previousStatus: 'transient_failure',
      previousAlertedAt: NOW,
      consecutiveTransientFailures: 1,
      result: { ok: false, code: 'transient_failure', checkedAt: NOW.toISOString() },
      now: NOW,
    })
    const recovered = deriveSsoHealthPersistence({
      previousStatus: 'transient_failure',
      previousAlertedAt: NOW,
      consecutiveTransientFailures: 2,
      result: { ok: true, code: 'healthy', checkedAt: NOW.toISOString() },
      now: NOW,
    })

    expect(transient.consecutiveTransientFailures).toBe(2)
    expect(recovered).toMatchObject({
      shouldAlert: false,
      consecutiveTransientFailures: 0,
      lastProbeStatus: 'healthy',
    })
  })

  it('alerts at expiry threshold transitions without repeating every day', () => {
    const sameThreshold = deriveSsoHealthPersistence({
      previousStatus: 'expires_30d',
      previousAlertedAt: new Date(NOW.getTime() - 25 * 60 * 60_000),
      consecutiveTransientFailures: 0,
      result: { ok: false, code: 'expires_30d', checkedAt: NOW.toISOString() },
      now: NOW,
    })
    const nextThreshold = deriveSsoHealthPersistence({
      previousStatus: 'expires_30d',
      previousAlertedAt: new Date(NOW.getTime() - 24 * 60 * 60_000),
      consecutiveTransientFailures: 0,
      result: { ok: false, code: 'expires_14d', checkedAt: NOW.toISOString() },
      now: NOW,
    })

    expect(sameThreshold.shouldAlert).toBe(false)
    expect(nextThreshold.shouldAlert).toBe(true)
  })
})
