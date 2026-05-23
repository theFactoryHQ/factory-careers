import { describe, expect, it } from 'vitest'
import {
  collectRequestTrustedOrigins,
  normalizeTrustedOrigin,
} from '../../server/utils/authOrigins'

describe('auth trusted origin helpers', () => {
  it('trusts the public forwarded origin for proxied production auth posts', () => {
    const request = new Request('http://internal-render:10000/api/auth/sign-in/sso', {
      method: 'POST',
      headers: {
        origin: 'https://careers.thefactoryhq.com',
        host: 'internal-render:10000',
        'x-forwarded-host': 'careers.thefactoryhq.com',
        'x-forwarded-proto': 'https',
      },
    })

    expect(collectRequestTrustedOrigins(request)).toContain('https://careers.thefactoryhq.com')
  })

  it('does not trust an unrelated origin header just because it was sent', () => {
    const request = new Request('https://careers.thefactoryhq.com/api/auth/sign-in/sso', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        host: 'careers.thefactoryhq.com',
      },
    })

    expect(collectRequestTrustedOrigins(request)).not.toContain('https://attacker.example')
  })

  it('normalizes configured urls with paths to plain origins', () => {
    expect(normalizeTrustedOrigin('https://careers.thefactoryhq.com/api/auth'))
      .toBe('https://careers.thefactoryhq.com')
  })

  it('keeps trusted-origin wildcard patterns intact', () => {
    expect(normalizeTrustedOrigin('https://*.factory-preview.example'))
      .toBe('https://*.factory-preview.example')
  })
})
