import { describe, expect, it, vi } from 'vitest'
import {
  getCachedMicrosoftSsoHealth,
  probeMicrosoftSsoCredential,
  resetMicrosoftSsoHealthCache,
} from '../../server/utils/microsoftSsoHealth'
import { protectSsoProviderRecord } from '../../server/utils/ssoProviderSecrets'

const ROOT_SECRET = 'microsoft-sso-health-root-secret'.repeat(2)
const NOW = new Date('2026-08-10T12:00:00.000Z')

function provider() {
  return protectSsoProviderRecord({
    oidcConfig: JSON.stringify({
      clientId: 'client-id-that-must-not-leak',
      clientSecret: 'client-secret-that-must-not-leak',
      tokenEndpoint: 'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token',
    }),
  }, ROOT_SECRET)
}

function metadata(expiresAt = new Date('2026-12-01T00:00:00.000Z')) {
  return { expiresAt }
}

function assertSanitized(value: unknown) {
  const serialized = JSON.stringify(value)
  for (const sensitive of [
    'client-id-that-must-not-leak',
    'client-secret-that-must-not-leak',
    'tenant-id',
    'access-token-that-must-not-leak',
    'raw provider description',
    'fc-sso:v1:',
  ]) {
    expect(serialized).not.toContain(sensitive)
  }
}

describe('Microsoft SSO credential health probe', () => {
  it('maps a successful token exchange to a sanitized healthy result', async () => {
    const safeFetch = vi.fn(async () => new Response(JSON.stringify({
      access_token: 'access-token-that-must-not-leak',
      token_type: 'Bearer',
    }), { status: 200 }))

    const result = await probeMicrosoftSsoCredential({
      provider: provider(),
      metadata: metadata(),
      rootSecret: ROOT_SECRET,
      safeFetch,
      now: NOW,
    })

    expect(result).toEqual({ ok: true, code: 'healthy', checkedAt: NOW.toISOString() })
    assertSanitized(result)
    expect(safeFetch).toHaveBeenCalledOnce()
    const init = safeFetch.mock.calls[0]![1]!
    expect(String(init.body)).toContain('grant_type=client_credentials')
    expect(String(init.body)).not.toContain('fc-sso:v1:')
  })

  it('normalizes invalid_client without retaining raw provider details', async () => {
    const safeFetch = vi.fn(async () => new Response(JSON.stringify({
      error: 'invalid_client',
      error_description: 'raw provider description client-secret-that-must-not-leak',
    }), { status: 401 }))

    const result = await probeMicrosoftSsoCredential({
      provider: provider(),
      metadata: metadata(),
      rootSecret: ROOT_SECRET,
      safeFetch,
      now: NOW,
    })

    expect(result).toEqual({ ok: false, code: 'invalid_client', checkedAt: NOW.toISOString() })
    assertSanitized(result)
  })

  it.each([
    ['30-day', '2026-09-01T00:00:00.000Z', 'expires_30d'],
    ['14-day', '2026-08-20T00:00:00.000Z', 'expires_14d'],
    ['7-day', '2026-08-15T00:00:00.000Z', 'expires_7d'],
    ['expired', '2026-08-09T00:00:00.000Z', 'expired'],
  ] as const)('returns the %s expiry threshold after a valid exchange', async (_name, expiry, code) => {
    const result = await probeMicrosoftSsoCredential({
      provider: provider(),
      metadata: metadata(new Date(expiry)),
      rootSecret: ROOT_SECRET,
      safeFetch: vi.fn(async () => new Response('{}', { status: 200 })),
      now: NOW,
    })

    expect(result).toEqual({ ok: false, code, checkedAt: NOW.toISOString() })
  })

  it('normalizes timeouts and server errors as transient failures', async () => {
    const timeoutResult = await probeMicrosoftSsoCredential({
      provider: provider(),
      metadata: metadata(),
      rootSecret: ROOT_SECRET,
      safeFetch: vi.fn(async () => { throw new DOMException('timed out', 'AbortError') }),
      now: NOW,
    })
    const serverResult = await probeMicrosoftSsoCredential({
      provider: provider(),
      metadata: metadata(),
      rootSecret: ROOT_SECRET,
      safeFetch: vi.fn(async () => new Response('{}', { status: 503 })),
      now: NOW,
    })

    expect(timeoutResult.code).toBe('transient_failure')
    expect(serverResult.code).toBe('transient_failure')
  })

  it('returns metadata_missing without making a request', async () => {
    const safeFetch = vi.fn()
    const result = await probeMicrosoftSsoCredential({
      provider: provider(),
      metadata: null,
      rootSecret: ROOT_SECRET,
      safeFetch,
      now: NOW,
    })

    expect(result.code).toBe('metadata_missing')
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('caches results inside the TTL', async () => {
    resetMicrosoftSsoHealthCache()
    const run = vi.fn(async () => ({
      ok: true as const,
      code: 'healthy' as const,
      checkedAt: NOW.toISOString(),
    }))

    const first = await getCachedMicrosoftSsoHealth(run, NOW.getTime())
    const second = await getCachedMicrosoftSsoHealth(run, NOW.getTime() + 60_000)

    expect(first).toEqual(second)
    expect(run).toHaveBeenCalledOnce()
  })
})
