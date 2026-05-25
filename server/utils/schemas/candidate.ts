import { z } from 'zod'
import {
  candidateCreateFieldsSchema,
  candidateDateOfBirthSchema,
  candidateGenderSchema,
  candidateGenderValues,
  candidateUpdateFieldsSchema,
} from '~~/shared/schemas/candidate'

// ─────────────────────────────────────────────
// Candidate validation schemas — shared across API routes
// ─────────────────────────────────────────────

/** Schema for creating a new candidate */
export const createCandidateSchema = candidateCreateFieldsSchema.extend({
  quickNotes: z.string().max(1000).optional(),
})

/** Schema for updating an existing candidate (all fields optional) */
export const updateCandidateSchema = candidateUpdateFieldsSchema.extend({
  quickNotes: z.string().max(1000).nullish(),
})

/** Schema for candidate list query params */
export const candidateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  gender: candidateGenderSchema.optional(),
  dobFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dobFrom must be YYYY-MM-DD').optional(),
  dobTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dobTo must be YYYY-MM-DD').optional(),
  /** JSON-encoded array of { propertyDefinitionId, op, value } filters */
  propertyFilters: z.string().optional(),
})

/** Reusable schema for `:id` route params */
export const candidateIdParamSchema = z.object({
  id: z.string().min(1),
})

export { candidateDateOfBirthSchema, candidateGenderValues }
