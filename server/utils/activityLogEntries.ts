import { eq, and, desc } from 'drizzle-orm'
import { activityLog, user } from '../database/schema'
import {
  paginatedListResponse,
  paginationOffset,
} from './schemas/common'
import type { activityLogQuerySchema } from './schemas/activityLog'
import type { z } from 'zod'

export type ActivityLogQuery = z.infer<typeof activityLogQuerySchema>

/**
 * Fetch paginated activity-log entries for an organization with actor details.
 * Used by GET /api/activity-log.
 */
export async function fetchActivityLogEntries(
  organizationId: string,
  query: ActivityLogQuery,
) {
  const offset = paginationOffset(query.page, query.limit)
  const conditions = [eq(activityLog.organizationId, organizationId)]

  if (query.resourceType) {
    conditions.push(eq(activityLog.resourceType, query.resourceType))
  }
  if (query.resourceId) {
    conditions.push(eq(activityLog.resourceId, query.resourceId))
  }

  const where = and(...conditions)

  const [data, total] = await Promise.all([
    db
      .select({
        id: activityLog.id,
        action: activityLog.action,
        resourceType: activityLog.resourceType,
        resourceId: activityLog.resourceId,
        metadata: activityLog.metadata,
        createdAt: activityLog.createdAt,
        actorId: activityLog.actorId,
        actorName: user.name,
        actorEmail: user.email,
        actorImage: user.image,
      })
      .from(activityLog)
      .innerJoin(user, eq(user.id, activityLog.actorId))
      .where(where)
      .orderBy(desc(activityLog.createdAt))
      .limit(query.limit)
      .offset(offset),
    db.$count(activityLog, where),
  ])

  return paginatedListResponse(data, total, query.page, query.limit)
}