import { beforeEach, describe, expect, it, vi } from 'vitest'

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(async () => [{ address: '203.0.113.10', family: 4 }]),
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsMocks.lookup,
}))

import {
  buildOidcRegistrationConfigFromDiscovery,
  discoverOidcRegistrationConfig,
  validateSsoIssuerUrlShape,
} from '../../server/utils/ssoSecurity'

function makeError(opts: { statusCode: number, statusMessage?: string, cause?: unknown }) {
  return Object.assign(new Error(opts.statusMessage), opts)
}

beforeEach(() => {
  dnsMocks.lookup.mockReset()
  dnsMocks.lookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }])
  vi.stubGlobal('createError', makeError)
})

describe('SSO issuer URL validation', () => {
  it('requires HTTPS for public issuers', () => {
    expect(validateSsoIssuerUrlShape('https://auth.example.com').ok).toBe(true)
    expect(validateSsoIssuerUrlShape('http://auth.example.com').ok).toBe(false)
  })

  it('allows localhost HTTP only when explicitly requested for local development', () => {
    expect(validateSsoIssuerUrlShape('http://localhost:8080/realms/dev').ok).toBe(false)
    expect(validateSsoIssuerUrlShape('http://localhost:8080/realms/dev', { allowLocalHttp: true }).ok).toBe(true)
  })

  it('rejects private and metadata issuers', () => {
    for (const issuer of [
      'https://10.0.0.5/realms/prod',
      'https://172.16.0.5/realms/prod',
      'https://192.168.1.5/realms/prod',
      'https://169.254.169.254/latest/meta-data',
      'https://metadata.google.internal/computeMetadata/v1',
    ]) {
      expect(validateSsoIssuerUrlShape(issuer).ok, `Expected ${issuer} to be rejected`).toBe(false)
    }
  })
})

describe('SSO OIDC discovery hardening', () => {
  it('fetches discovery through the injected safe outbound fetch', async () => {
    const safeFetch = vi.fn(async () => Response.json({
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      userinfo_endpoint: 'https://auth.example.com/userinfo',
      jwks_uri: 'https://auth.example.com/certs',
    }))
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw new Error('ordinary fetch must not be used')
    }))

    await expect(discoverOidcRegistrationConfig(
      'https://auth.example.com',
      {},
      { safeFetch },
    )).resolves.toMatchObject({
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
      jwksEndpoint: 'https://auth.example.com/certs',
    })

    expect(safeFetch).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/openid-configuration',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('builds explicit OIDC endpoints so registration can skip Better Auth runtime discovery', async () => {
    const config = await buildOidcRegistrationConfigFromDiscovery('https://accounts.google.com', {
      issuer: 'https://accounts.google.com',
      authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_endpoint: 'https://oauth2.googleapis.com/token',
      userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
      jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
    })

    expect(config).toMatchObject({
      skipDiscovery: true,
      discoveryEndpoint: 'https://accounts.google.com/.well-known/openid-configuration',
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
      jwksEndpoint: 'https://www.googleapis.com/oauth2/v3/certs',
    })
  })

  it('rejects discovery documents whose issuer does not match exactly except trailing slash', async () => {
    await expect(buildOidcRegistrationConfigFromDiscovery('https://auth.example.com', {
      issuer: 'https://evil.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      jwks_uri: 'https://auth.example.com/certs',
    })).rejects.toThrow(/issuer/i)
  })

  it('rejects discovery endpoints that target private hosts', async () => {
    await expect(buildOidcRegistrationConfigFromDiscovery('https://auth.example.com', {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://10.0.0.5/token',
      jwks_uri: 'https://auth.example.com/certs',
    })).rejects.toThrow(/token_endpoint/i)
  })

  it('rejects discovery endpoints whose hostnames resolve to private addresses', async () => {
    dnsMocks.lookup.mockImplementation(async (hostname: string) => {
      if (hostname === 'internal.example.com') {
        return [{ address: '127.0.0.1', family: 4 }]
      }
      return [{ address: '203.0.113.10', family: 4 }]
    })

    await expect(buildOidcRegistrationConfigFromDiscovery('https://auth.example.com', {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://internal.example.com/token',
      jwks_uri: 'https://auth.example.com/certs',
    })).rejects.toThrow(/token_endpoint/i)

    expect(dnsMocks.lookup).toHaveBeenCalledWith('internal.example.com', { all: true, verbatim: true })
  })
})
