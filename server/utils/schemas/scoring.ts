import { z } from 'zod'
import { validateServerSideUrlShape } from '../serverSideUrl'

// ─── AI Config Schemas ────────────────────────────────────────────

const aiProviderValues = ['openai', 'anthropic', 'google', 'xai', 'openai_compatible'] as const

const safeBaseUrl = z.string().url().max(500)
  .refine(
    url => validateServerSideUrlShape(url).ok,
    'URL must use HTTPS and must not target credentials, local, private, link-local, multicast, or metadata hosts',
  )

export const createAiConfigSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  provider: z.enum(aiProviderValues),
  model: z.string().min(1).max(200),
  apiKey: z.string().min(1).max(500),
  baseUrl: safeBaseUrl.nullish(),
  // Modern frontier models support 100K+ output tokens. Cap generously to avoid blocking power users.
  maxTokens: z.number().int().min(256).max(200000).optional().default(16384),
  inputPricePer1m: z.number().min(0).max(9999).nullish(),
  outputPricePer1m: z.number().min(0).max(9999).nullish(),
  isDefaultChatbot: z.boolean().optional().default(false),
  isDefaultAnalysis: z.boolean().optional().default(false),
})

export const updateAiConfigSchema = z.object({
  name: z.string().min(1).max(80).trim().optional(),
  provider: z.enum(aiProviderValues).optional(),
  model: z.string().min(1).max(200).optional(),
  apiKey: z.string().min(1).max(500).optional(),
  baseUrl: safeBaseUrl.nullish(),
  maxTokens: z.number().int().min(256).max(200000).optional(),
  inputPricePer1m: z.number().min(0).max(9999).nullish(),
  outputPricePer1m: z.number().min(0).max(9999).nullish(),
})

export const setAiConfigDefaultSchema = z.object({
  /** Which "purpose" slots to claim for this configuration. */
  purposes: z.array(z.enum(['chatbot', 'analysis'])).min(1),
})

// ─── Scoring Criterion Schemas ────────────────────────────────────

const criterionCategoryValues = ['technical', 'experience', 'soft_skills', 'education', 'culture', 'custom'] as const

export const createCriterionSchema = z.object({
  key: z.string()
    .min(1).max(100)
    .regex(/^[a-z][a-z0-9_]*$/, 'Key must be lowercase alphanumeric with underscores, starting with a letter'),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullish(),
  category: z.enum(criterionCategoryValues).optional().default('custom'),
  maxScore: z.number().int().min(1).max(100).optional().default(10),
  weight: z.number().int().min(0).max(100).optional().default(50),
  displayOrder: z.number().int().min(0).optional().default(0),
})

export const updateCriterionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullish(),
  category: z.enum(criterionCategoryValues).optional(),
  maxScore: z.number().int().min(1).max(100).optional(),
  weight: z.number().int().min(0).max(100).optional(),
  displayOrder: z.number().int().min(0).optional(),
})

export const bulkCriteriaSchema = z.object({
  criteria: z.array(createCriterionSchema).min(1).max(20),
})

export const updateWeightsSchema = z.object({
  weights: z.array(z.object({
    key: z.string().min(1).max(100),
    weight: z.number().int().min(0).max(100),
  })).min(1).max(20),
})

// ─── Scoring Feedback Schema ─────────────────────────────────────

export const createScoringFeedbackSchema = z.object({
  sentiment: z.enum(['up', 'down']),
  analysisRunId: z.string().min(1).max(200).nullable().optional(),
  comment: z.string().trim().max(2000).optional(),
}).superRefine((value, context) => {
  if (value.sentiment === 'down' && !value.comment?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['comment'],
      message: 'Comment is required for negative scoring feedback',
    })
  }
})

// ─── Generate Criteria Schema ─────────────────────────────────────

export const generateCriteriaSchema = z.object({
  template: z.enum(['standard', 'technical', 'non_technical']).optional(),
})
