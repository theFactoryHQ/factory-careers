import { z } from 'zod'
import { hasCompleteScoreCoverage } from '~~/shared/scoring-bands'

const scoringBandColorValues = ['danger', 'warning', 'success', 'neutral'] as const

export const scoringBandSchema = z.object({
  label: z.string().trim().min(1).max(80),
  minScore: z.number().int().min(0).max(100),
  maxScore: z.number().int().min(0).max(100),
  color: z.enum(scoringBandColorValues).default('neutral'),
  description: z.string().trim().max(240).optional(),
}).refine(
  band => band.minScore <= band.maxScore,
  { message: 'Band minimum must be less than or equal to maximum.' },
)

export const scoringBandsSchema = z.array(scoringBandSchema).min(1).max(6).superRefine((bands, context) => {
  if (!hasCompleteScoreCoverage(bands)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Scoring bands must cover 0 through 100 without gaps or overlaps.',
    })
  }
})
