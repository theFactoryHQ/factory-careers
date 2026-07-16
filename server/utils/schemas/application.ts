import { z } from 'zod'
import { APPLICATION_STATUSES } from '~~/shared/application-status'
import { paginationQuerySchema } from './common'

export { APPLICATION_STATUS_TRANSITIONS } from '~~/shared/status-transitions'

// ─────────────────────────────────────────────
// Application validation schemas — shared across API routes
// ─────────────────────────────────────────────

/** Schema for creating a new application (recruiter links candidate → job) */
export const createApplicationSchema = z.object({
  candidateId: z.string().min(1, 'Candidate is required'),
  jobId: z.string().min(1, 'Job is required'),
  notes: z.string().max(5000).optional(),
})

/** Schema for updating an existing application (status transitions, notes, score) */
export const updateApplicationSchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  notes: z.string().max(5000).nullish(),
  score: z.number().int().min(0).max(100).nullish(),
})

/** Schema for application list query params */
export const applicationQuerySchema = paginationQuerySchema().extend({
  jobId: z.string().min(1).optional(),
  candidateId: z.string().min(1).optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  /** Full application-content search, including parsed candidate documents. */
  search: z.string().trim().min(3, 'Search must be at least 3 characters').max(200).optional(),
  /** JSON-encoded array of { propertyDefinitionId, op, value } filters */
  propertyFilters: z.string().optional(),
})

/** Reusable schema for `:id` route params */
export const applicationIdParamSchema = z.object({
  id: z.string().min(1),
})

// Status transition rules are now in shared/status-transitions.ts
// and re-exported above for backward compatibility.
