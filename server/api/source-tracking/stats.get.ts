import { sourceStatsQuerySchema } from '../../utils/schemas/trackingLink'
import { fetchOrgSourceAnalytics } from '../../utils/sourceAnalytics'

/**
 * GET /api/source-tracking/stats
 * Returns comprehensive source analytics for the current organization:
 * - Channel breakdown (applications per source channel)
 * - Top tracking links by applications
 * - Source trends over time (last 30 days by default)
 * - Conversion funnel (applications by status per channel)
 * - Recent attributed applications
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sourceTracking: ['read'], application: ['read'] })
  const orgId = session.session.activeOrganizationId

  const query = await getValidatedQuery(event, sourceStatsQuerySchema.parse)

  return fetchOrgSourceAnalytics(orgId, query)
})