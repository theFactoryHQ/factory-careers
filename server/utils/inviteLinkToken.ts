import { createHash } from 'node:crypto'

export const INVITE_LINK_TOKEN_LENGTH = 64
export const INVITE_LINK_TOKEN_PATTERN = /^[0-9a-f]+$/

/**
 * Hash a raw shareable invite-link token for storage and lookup.
 *
 * Raw tokens are bearer credentials and must never be persisted or logged.
 */
export function hashInviteLinkToken(token: string): string {
  if (
    token.length !== INVITE_LINK_TOKEN_LENGTH
    || !INVITE_LINK_TOKEN_PATTERN.test(token)
  ) {
    throw new TypeError('Invalid invite link token format')
  }

  return createHash('sha256').update(token, 'utf8').digest('hex')
}
