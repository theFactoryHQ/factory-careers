import { trackingLink } from '../../database/schema'
import { findOrgScopedOr404, orgScopedIdWhere } from '../../utils/orgScope'
import { trackingLinkIdSchema, updateTrackingLinkSchema } from '../../utils/schemas/trackingLink'

/**
 * PATCH /api/tracking-links/:id
 * Update a tracking link (name, channel, UTM params, active status).
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sourceTracking: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, trackingLinkIdSchema.parse)
  const body = await readValidatedBody(event, updateTrackingLinkSchema.parse)

  await findOrgScopedOr404(
    db.query.trackingLink.findFirst({
      where: orgScopedIdWhere(trackingLink, id, orgId),
      columns: { id: true },
    }),
    'Tracking link not found',
  )

  const [updated] = await db.update(trackingLink)
    .set({ ...body, updatedAt: new Date() })
    .where(orgScopedIdWhere(trackingLink, id, orgId))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Tracking link not found' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'trackingLink',
    resourceId: updated.id,
    metadata: {
      changedFields: Object.keys(body),
      channel: updated.channel,
      jobId: updated.jobId,
      isActive: updated.isActive,
    },
  })

  return updated
})
