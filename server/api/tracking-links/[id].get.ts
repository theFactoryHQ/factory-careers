import { trackingLink } from '../../database/schema'
import { findOrgScopedOr404, orgScopedIdWhere } from '../../utils/orgScope'
import { trackingLinkIdSchema } from '../../utils/schemas/trackingLink'

/**
 * GET /api/tracking-links/:id
 * Get a single tracking link by ID.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sourceTracking: ['read'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, trackingLinkIdSchema.parse)

  return findOrgScopedOr404(
    db.query.trackingLink.findFirst({
      where: orgScopedIdWhere(trackingLink, id, orgId),
    }),
    'Tracking link not found',
  )
})
