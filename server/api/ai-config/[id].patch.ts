import { and, eq } from 'drizzle-orm'
import { aiConfig } from '../../database/schema'
import { toPublicAiConfig } from '../../utils/ai/publicConfig'
import { resourceIdParamSchema } from '../../utils/schemas/common'
import { updateAiConfigSchema } from '../../utils/schemas/scoring'
import { encrypt } from '../../utils/encryption'
import { assertSafeServerSideUrl } from '../../utils/serverSideUrl'


/**
 * PATCH /api/ai-config/:id
 *
 * Update an AI configuration. Re-encrypts the API key only when supplied,
 * so users can edit name / model / pricing without re-entering credentials.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { aiConfig: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, resourceIdParamSchema.parse)
  const body = await readValidatedBody(event, updateAiConfigSchema.parse)

  if (body.baseUrl) {
    await assertSafeServerSideUrl(body.baseUrl)
  }

  const existing = await db.query.aiConfig.findFirst({
    where: and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'AI configuration not found.' })

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) updates.name = body.name
  if (body.provider !== undefined) updates.provider = body.provider
  if (body.model !== undefined) updates.model = body.model
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl ?? null
  if (body.maxTokens !== undefined) updates.maxTokens = body.maxTokens
  if (body.inputPricePer1m !== undefined) updates.inputPricePer1m = body.inputPricePer1m != null ? String(body.inputPricePer1m) : null
  if (body.outputPricePer1m !== undefined) updates.outputPricePer1m = body.outputPricePer1m != null ? String(body.outputPricePer1m) : null
  if (body.apiKey) updates.apiKeyEncrypted = encrypt(body.apiKey, env.BETTER_AUTH_SECRET)

  const [updated] = await db.update(aiConfig)
    .set(updates)
    .where(and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)))
    .returning({
      id: aiConfig.id,
      name: aiConfig.name,
      provider: aiConfig.provider,
      model: aiConfig.model,
      baseUrl: aiConfig.baseUrl,
      maxTokens: aiConfig.maxTokens,
      inputPricePer1m: aiConfig.inputPricePer1m,
      outputPricePer1m: aiConfig.outputPricePer1m,
      isDefaultChatbot: aiConfig.isDefaultChatbot,
      isDefaultAnalysis: aiConfig.isDefaultAnalysis,
      apiKeyEncrypted: aiConfig.apiKeyEncrypted,
    })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'aiConfig',
    resourceId: id,
  })

  return { config: toPublicAiConfig(updated!) }
})
