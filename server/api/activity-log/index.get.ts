import { activityLogQuerySchema } from '../../utils/schemas/activityLog'
import { fetchActivityLogEntries } from '../../utils/activityLogEntries'

/**
 * GET /api/activity-log
 * List activity log entries for the current organization.
 * Requires activityLog:read permission.
 * Supports optional filters by resourceType and resourceId.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { activityLog: ['read'] })
  const orgId = session.session.activeOrganizationId

  const query = await getValidatedQuery(event, activityLogQuerySchema.parse)

  return fetchActivityLogEntries(orgId, query)
})