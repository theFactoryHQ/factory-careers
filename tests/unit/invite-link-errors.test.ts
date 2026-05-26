import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INVALID_INVITE_LINK_MESSAGE,
  formatInviteLinkError,
} from '../../app/utils/invite-link-errors'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('invite-link error formatting', () => {
  it('hides generic validation errors from public invite-link UI', () => {
    expect(formatInviteLinkError({ data: { statusMessage: 'Validation Error' } })).toBe(INVALID_INVITE_LINK_MESSAGE)
    expect(formatInviteLinkError({ statusMessage: 'Invalid invite token' })).toBe(INVALID_INVITE_LINK_MESSAGE)
    expect(formatInviteLinkError({ data: { statusMessage: 'Bad Request' } })).toBe(INVALID_INVITE_LINK_MESSAGE)
  })

  it('preserves specific invite-link errors that are useful to the user', () => {
    expect(formatInviteLinkError({
      data: { statusMessage: 'This invite link has reached its maximum number of uses' },
    })).toBe('This invite link has reached its maximum number of uses')
  })

  it('uses a caller-provided fallback when there is no useful public message', () => {
    expect(formatInviteLinkError({}, 'Please ask an administrator for a new invitation.')).toBe('Please ask an administrator for a new invitation.')
  })

  it('keeps the public invite-link info route from returning generic validation status text', () => {
    const source = read('server/api/invite-links/info/[token].get.ts')

    expect(source).toContain('safeParse(getRouterParams(event))')
    expect(source).toContain("statusMessage: 'Invalid, expired, or revoked invite link'")
    expect(source).not.toContain('getValidatedRouterParams')
    expect(source).not.toContain('Invalid invite token')
  })
})
