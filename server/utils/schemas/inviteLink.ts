import { z } from 'zod'
import {
  INVITE_LINK_TOKEN_LENGTH,
  INVITE_LINK_TOKEN_PATTERN,
} from '../inviteLinkToken'

const inviteLinkTokenSchema = z.string()
  .length(INVITE_LINK_TOKEN_LENGTH)
  .regex(INVITE_LINK_TOKEN_PATTERN)

/**
 * Schema for creating a new shareable invite link.
 */
export const createInviteLinkSchema = z.object({
  role: z.enum(['admin', 'member']).default('member'),
  maxUses: z.number().int().min(1).max(10000).nullable().optional().default(null),
  /** Expiry duration in hours — minimum 1h, maximum 30 days, default 7 days */
  expiresInHours: z.number().int().min(1).max(720).default(168),
})

/**
 * Schema for accepting an invite link by token.
 */
export const acceptInviteLinkSchema = z.object({
  token: inviteLinkTokenSchema,
})

export const inviteLinkInfoParamsSchema = z.object({
  token: inviteLinkTokenSchema,
})
