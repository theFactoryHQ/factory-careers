import { describe, expect, it } from 'vitest'
import { deriveSsoHealthPersistence } from '../../server/utils/microsoftSsoHealth'

const checkedAt = '2026-08-10T12:00:00.000Z'

describe('SSO health probe persistence', () => {
  it('counts fresh transient failures and resets the count on a passing exchange', () => {
    expect(deriveSsoHealthPersistence({
      consecutiveTransientFailures: 1,
      result: { ok: false, code: 'transient_failure', checkedAt },
    })).toMatchObject({ consecutiveTransientFailures: 2, lastProbeStatus: 'transient_failure' })
    expect(deriveSsoHealthPersistence({
      consecutiveTransientFailures: 2,
      result: { ok: true, code: 'expires_14d', checkedAt },
    })).toMatchObject({
      consecutiveTransientFailures: 0, lastProbeStatus: 'expires_14d',
      lastSuccessfulProbeAt: new Date(checkedAt),
    })
  })
})
