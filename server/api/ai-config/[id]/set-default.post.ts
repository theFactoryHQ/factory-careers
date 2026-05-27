import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { aiConfig } from '../../../database/schema'
import { setAiConfigDefaultSchema } from '../../../utils/schemas/scoring'

const paramsSchema = z.object({ id: z.string().min(1) })

/**
 * POST /api/ai-config/:id/set-default
 *
 * Atomically claims one or more "default" slots (chatbot, analysis) for this
 * configuration. Each purpose is cleared before setting the selected row so
 * Postgres never sees two default rows while enforcing the partial unique
 * indexes on `is_default_chatbot` and `is_default_analysis`.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { aiConfig: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, setAiConfigDefaultSchema.parse)

  const existing = await db.query.aiConfig.findFirst({
    where: and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'AI configuration not found.' })

  await db.transaction(async (tx) => {
    if (body.purposes.includes('chatbot')) {
      await tx.update(aiConfig)
        .set({
          isDefaultChatbot: false,
          updatedAt: new Date(),
        })
        .where(eq(aiConfig.organizationId, orgId))
      await tx.update(aiConfig)
        .set({
          isDefaultChatbot: true,
          updatedAt: new Date(),
        })
        .where(and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)))
    }
    if (body.purposes.includes('analysis')) {
      await tx.update(aiConfig)
        .set({
          isDefaultAnalysis: false,
          updatedAt: new Date(),
        })
        .where(eq(aiConfig.organizationId, orgId))
      await tx.update(aiConfig)
        .set({
          isDefaultAnalysis: true,
          updatedAt: new Date(),
        })
        .where(and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)))
    }
  })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'aiConfig',
    resourceId: id,
    metadata: { setDefault: body.purposes },
  })

  return { success: true }
})
