import { z } from 'zod'
import {
  AnalyzeApplicationError,
  analyzeApplication,
} from '../../../utils/analyzeApplication'
import { createRateLimiter } from '../../../utils/rateLimit'
import { resourceIdParamSchema } from '../../../utils/schemas/common'

const bodySchema = z.object({
  /** Optional override; falls back to the org's analysis default. */
  aiConfigId: z.string().min(1).nullable().optional(),
}).partial().optional()
const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
  message: 'Too many AI analysis requests. Please wait before retrying.',
})

function mapAnalyzeApplicationError(error: AnalyzeApplicationError) {
  if (error.code === 'APPLICATION_NOT_FOUND') {
    return createError({ statusCode: 404, statusMessage: error.message })
  }

  if (error.code === 'PROVIDER_FAILURE') {
    return createError({
      statusCode: 502,
      statusMessage: `AI analysis failed: ${error.message}`,
    })
  }

  return createError({
    statusCode: 422,
    statusMessage: error.message,
    data: error.code === 'RESUME_PARSE_FAILED'
      ? { code: 'PARSE_FAILED', documentId: error.documentId }
      : undefined,
  })
}

/**
 * POST /api/applications/:id/analyze
 * Run AI analysis on a single application. Scores the candidate against job criteria.
 */
export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { scoring: ['create'] })
  const organizationId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, resourceIdParamSchema.parse)
  const body = await readBody(event).catch(() => null)
  const parsedBody = body ? bodySchema.parse(body) : null

  try {
    return await analyzeApplication({
      organizationId,
      applicationId,
      aiConfigId: parsedBody?.aiConfigId ?? null,
      scoredById: session.user.id,
    })
  }
  catch (error) {
    if (error instanceof AnalyzeApplicationError) {
      throw mapAnalyzeApplicationError(error)
    }
    throw error
  }
})
