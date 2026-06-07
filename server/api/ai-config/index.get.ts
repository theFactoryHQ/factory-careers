import { eq } from 'drizzle-orm'
import { aiConfig } from '../../database/schema'
import { toPublicAiConfig } from '../../utils/ai/publicConfig'

/**
 * GET /api/ai-config
 *
 * List ALL AI configurations for the active organization, ordered with
 * defaults first then by recency. Never returns the encrypted API key —
 * only a `hasApiKey` boolean.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { aiConfig: ['read'] })
  const orgId = session.session.activeOrganizationId

  const rows = await db.query.aiConfig.findMany({
    where: eq(aiConfig.organizationId, orgId),
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
    orderBy: (t, { desc }) => [desc(t.isDefaultChatbot), desc(t.isDefaultAnalysis), desc(t.createdAt)],
  })

  return rows.map(toPublicAiConfig)
})
