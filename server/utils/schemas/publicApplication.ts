import { z } from 'zod'
import { factoryDivisionSchema } from '~~/shared/job-listing-structure'
import { COUNTRY_VALUES, US_STATE_VALUES } from '~~/shared/location-options'
import {
  candidateFirstNameSchema,
  candidateLastNameSchema,
  candidatePhoneSchema,
  publicCandidateEmailSchema,
} from '~~/shared/schemas/candidate'

// ─────────────────────────────────────────────
// Public application submission schemas
// ─────────────────────────────────────────────

/** Schema for a single question response in a public application */
const questionResponseSchema = z.object({
  questionId: z.string().min(1),
  value: z.union([
    z.string(),
    z.array(z.string()),
    z.number(),
    z.boolean(),
  ]),
})

export const complianceSexValues = ['male', 'female', 'prefer_not_to_answer'] as const
export const complianceRaceEthnicityValues = [
  'hispanic_or_latino',
  'white',
  'black_or_african_american',
  'asian',
  'native_hawaiian_or_pacific_islander',
  'american_indian_or_alaska_native',
  'two_or_more_races',
  'prefer_not_to_answer',
] as const
export const complianceVeteranStatusValues = ['protected_veteran', 'not_protected_veteran', 'prefer_not_to_answer'] as const
export const complianceDisabilityStatusValues = ['yes', 'no', 'prefer_not_to_answer'] as const

export const publicApplicationComplianceSchema = z.object({
  sex: z.enum(complianceSexValues).optional(),
  raceEthnicity: z.enum(complianceRaceEthnicityValues).optional(),
  veteranStatus: z.enum(complianceVeteranStatusValues).optional(),
  disabilityStatus: z.enum(complianceDisabilityStatusValues).optional(),
}).strict()

/** Schema for public application submission on an open job */
export const publicApplicationSchema = z.object({
  firstName: candidateFirstNameSchema,
  lastName: candidateLastNameSchema,
  email: publicCandidateEmailSchema,
  phone: candidatePhoneSchema.optional(),
  country: z.enum(COUNTRY_VALUES, 'Country is required'),
  state: z.enum(US_STATE_VALUES, 'State is required'),
  responses: z.array(questionResponseSchema).default([]),
  /** Optional voluntary self-identification answers for compliance reporting. */
  compliance: publicApplicationComplianceSchema.optional(),
  /** Optional cover letter text submitted by the candidate */
  coverLetterText: z.string().max(10000).optional(),
  /** Honeypot field — bots fill it, humans don't see it. Validated at runtime in the handler. */
  website: z.string().optional(),
  /** Source attribution — captured from URL query parameters on the apply page */
  ref: z.string().max(100).optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
  utmTerm: z.string().max(200).optional(),
  utmContent: z.string().max(200).optional(),
})

/** Route param for public job slug */
export const publicJobSlugSchema = z.object({
  slug: z.string().min(1),
})

/** Route param for public job ID (legacy, used internally) */
export const publicJobIdSchema = z.object({
  id: z.string().min(1),
})

// ─────────────────────────────────────────────
// Public job board query schemas
// ─────────────────────────────────────────────

/** Schema for public job listing query params */
const publicJobDivisionsQuerySchema = z.preprocess((value) => {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const divisions = raw
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean)
  return divisions.length > 0 ? divisions : undefined
}, z.array(factoryDivisionSchema).optional())

export const publicJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().min(1).max(200).optional(),
  type: z.enum(['full_time', 'part_time', 'contract', 'internship']).optional(),
  location: z.string().min(1).max(200).optional(),
  divisions: publicJobDivisionsQuerySchema,
})
