import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { candidate, privacyRequest } from '../../database/schema'
import { privacyRequestListQuerySchema } from '../../utils/schemas/privacyRequest'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { privacyRequest: ['read'] })
  const orgId = session.session.activeOrganizationId
  const query = await getValidatedQuery(event, privacyRequestListQuerySchema.parse)
  const offset = (query.page - 1) * query.limit

  const scopedConditions = [eq(privacyRequest.organizationId, orgId)]
  if (query.status) scopedConditions.push(eq(privacyRequest.status, query.status))

  const scopedRows = await db.select().from(privacyRequest)
    .where(and(...scopedConditions))
    .orderBy(desc(privacyRequest.createdAt))

  const candidateEmails = await db
    .selectDistinct({ email: candidate.email })
    .from(candidate)
    .where(eq(candidate.organizationId, orgId))

  const matchedUnscoped = candidateEmails.length > 0
    ? await db.select().from(privacyRequest)
      .where(and(
        isNull(privacyRequest.organizationId),
        inArray(privacyRequest.requesterEmail, candidateEmails.map((row) => row.email)),
        ...(query.status ? [eq(privacyRequest.status, query.status)] : []),
      ))
      .orderBy(desc(privacyRequest.createdAt))
    : []

  const rows = [...scopedRows, ...matchedUnscoped]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const data = rows.slice(offset, offset + query.limit)

  return { data, total: rows.length, page: query.page, limit: query.limit }
})
