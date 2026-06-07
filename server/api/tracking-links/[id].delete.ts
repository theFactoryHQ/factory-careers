import { trackingLink } from '../../database/schema'
import { findOrgScopedOr404, orgScopedIdWhere } from '../../utils/orgScope'
import { trackingLinkIdSchema } from '../../utils/schemas/trackingLink'

/**
 * DELETE /api/tracking-links/:id
 * Delete a tracking link. Existing application sources referencing
 * this link will have their trackingLinkId set to null (FK on delete set null).
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sourceTracking: ['delete'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, trackingLinkIdSchema.parse)

  const existing = await findOrgScopedOr404(
    db.query.trackingLink.findFirst({
      where: orgScopedIdWhere(trackingLink, id, orgId),
      columns: { id: true },
    }),
    'Tracking link not found',
  )

  await db.delete(trackingLink)
    .where(orgScopedIdWhere(trackingLink, id, orgId))

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'trackingLink',
    resourceId: existing.id,
  })

  setResponseStatus(event, 204)
  return null
})
