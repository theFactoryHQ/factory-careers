import { and, eq } from 'drizzle-orm'
import { aiConfig } from '../../database/schema'
import { toPublicAiConfig } from '../../utils/ai/publicConfig'
import { resourceIdParamSchema } from '../../utils/schemas/common'


/**
 * GET /api/ai-config/:id — fetch a single AI configuration (no API key).
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { aiConfig: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, resourceIdParamSchema.parse)

  const row = await db.query.aiConfig.findFirst({
    where: and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)),
    columns: {
      id: true,
      name: true,
      provider: true,
      model: true,
      baseUrl: true,
      maxTokens: true,
      inputPricePer1m: true,
      outputPricePer1m: true,
      isDefaultChatbot: true,
      isDefaultAnalysis: true,
      apiKeyEncrypted: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'AI configuration not found.' })

  return toPublicAiConfig(row)
})
