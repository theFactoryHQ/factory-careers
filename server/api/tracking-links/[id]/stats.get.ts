import { eq } from 'drizzle-orm'
import { job, trackingLink } from '../../../database/schema'
import { findOrgScopedOr404, orgScopedIdWhere } from '../../../utils/orgScope'
import { trackingLinkIdSchema, sourceStatsQuerySchema } from '../../../utils/schemas/trackingLink'
import { fetchTrackingLinkSourceAnalytics } from '../../../utils/sourceAnalytics'

/**
 * GET /api/tracking-links/:id/stats
 * Returns detailed analytics for a single tracking link:
 * - Link metadata (name, channel, code, UTM params, click/app counts)
 * - Daily click/application trend
 * - Application status breakdown (funnel)
 * - All attributed applications with candidate + job info
 * - Referrer domain breakdown
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sourceTracking: ['read'], application: ['read'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, trackingLinkIdSchema.parse)
  const query = await getValidatedQuery(event, sourceStatsQuerySchema.parse)

  const link = await findOrgScopedOr404(
    db.query.trackingLink.findFirst({
      where: orgScopedIdWhere(trackingLink, id, orgId),
    }),
    'Tracking link not found',
  )

  let jobTitle: string | null = null
  if (link.jobId) {
    const j = await db.query.job.findFirst({
      where: eq(job.id, link.jobId),
      columns: { title: true },
    })
    jobTitle = j?.title ?? null
  }

  return fetchTrackingLinkSourceAnalytics(
    { ...link, jobTitle },
    query,
  )
})