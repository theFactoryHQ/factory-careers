import { z } from 'zod'

export const privacyRequestStatusValues = [
  'submitted',
  'verified',
  'in_review',
  'completed',
  'denied',
  'cancelled',
] as const

export const createPrivacyRequestSchema = z.object({
  requesterName: z.string().trim().min(1, 'Name is required').max(200),
  requesterEmail: z.string().trim().email('Valid email is required').max(254).transform((value) => value.toLowerCase()),
  stateOfResidence: z.string().trim().min(1, 'State of residence is required').max(100),
  jobSlug: z.string().trim().max(200).optional().or(z.literal('').transform(() => undefined)),
  applicationId: z.string().trim().max(100).optional().or(z.literal('').transform(() => undefined)),
  requestContext: z.string().trim().max(500).optional().or(z.literal('').transform(() => undefined)),
  details: z.string().trim().max(2000).optional().or(z.literal('').transform(() => undefined)),
  website: z.string().optional(),
})

export const verifyPrivacyRequestQuerySchema = z.object({
  token: z.string().min(32).max(256),
})

export const privacyRequestIdParamSchema = z.object({
  id: z.string().min(1),
})

export const privacyRequestListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(privacyRequestStatusValues).optional(),
})

export const updatePrivacyRequestSchema = z.object({
  status: z.enum(['in_review', 'denied', 'cancelled']).optional(),
  resolutionNotes: z.string().trim().max(2000).nullish(),
  denialReason: z.string().trim().max(2000).nullish(),
}).refine((body) => body.status || body.resolutionNotes !== undefined || body.denialReason !== undefined, {
  message: 'At least one update field is required',
})

export const fulfillPrivacyRequestSchema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1),
  resolutionNotes: z.string().trim().max(2000).optional(),
})
