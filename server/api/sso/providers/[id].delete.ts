import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { ssoProvider } from '~~/server/database/schema'

const deleteSsoSchema = z.object({
  id: z.string().min(1),
})

/**
 * DELETE /api/sso/providers/[id] — remove an SSO provider from the current org.
 * Only org owners/admins can delete providers.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, deleteSsoSchema.parse)

  // Atomic delete — single query avoids TOCTOU race condition
  const [deleted] = await db
    .delete(ssoProvider)
    .where(and(eq(ssoProvider.id, id), eq(ssoProvider.organizationId, orgId)))
    .returning({
      id: ssoProvider.id,
      providerId: ssoProvider.providerId,
      domain: ssoProvider.domain,
    })

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'SSO provider not found' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'ssoProvider',
    resourceId: deleted.id,
    metadata: {
      providerId: deleted.providerId,
      domain: deleted.domain,
    },
  })

  return { success: true }
})
