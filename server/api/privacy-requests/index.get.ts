import { and, desc, eq, exists, isNull, or } from 'drizzle-orm'
import { candidate, privacyRequest } from '../../database/schema'
import { privacyRequestListQuerySchema } from '../../utils/schemas/privacyRequest'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { privacyRequest: ['read'] })
  const orgId = session.session.activeOrganizationId
  const query = await getValidatedQuery(event, privacyRequestListQuerySchema.parse)
  const offset = (query.page - 1) * query.limit

  const where = and(
    or(
      eq(privacyRequest.organizationId, orgId),
      and(
        isNull(privacyRequest.organizationId),
        exists(
          db
            .select({ id: candidate.id })
            .from(candidate)
            .where(and(
              eq(candidate.organizationId, orgId),
              eq(candidate.email, privacyRequest.requesterEmail),
            )),
        ),
      ),
    ),
    ...(query.status ? [eq(privacyRequest.status, query.status)] : []),
  )

  const [data, total] = await Promise.all([
    db.select().from(privacyRequest)
      .where(where)
      .orderBy(desc(privacyRequest.createdAt))
      .limit(query.limit)
      .offset(offset),
    db.$count(privacyRequest, where),
  ])

  return { data, total, page: query.page, limit: query.limit }
})
