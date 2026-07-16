import { eq, and, or, ilike, desc, sql, gte, lte } from 'drizzle-orm'
import type { z } from 'zod'
import { candidate, application } from '../../database/schema'
import {
  paginatedListResponse,
  paginationOffset,
} from '../../utils/schemas/common'
import { candidateQuerySchema } from '../../utils/schemas/candidate'
import { loadPropertyEntriesForEntities, validatedPropertyFiltersCondition } from '../../utils/properties'
import { parsePropertyFiltersParam } from '../../utils/propertyFilters'

const getCachedCandidates = defineOrgScopedCachedFunction(
  'candidates-list',
  async (orgId, query: z.infer<typeof candidateQuerySchema>) => {
    const offset = paginationOffset(query.page, query.limit)
    const conditions = [eq(candidate.organizationId, orgId)]

    if (query.search) {
      // Escape LIKE meta-characters to prevent pattern injection
      const escaped = query.search.replace(/[%_\\]/g, '\\$&')
      const pattern = `%${escaped}%`
      conditions.push(
        or(
          ilike(candidate.firstName, pattern),
          ilike(candidate.lastName, pattern),
          ilike(candidate.email, pattern),
        )!,
      )
    }

    if (query.gender) {
      conditions.push(eq(candidate.gender, query.gender))
    }

    // dateOfBirth is stored as ISO 8601 text (YYYY-MM-DD), so lexicographic comparison works
    if (query.dobFrom) {
      conditions.push(gte(candidate.dateOfBirth, query.dobFrom))
    }
    if (query.dobTo) {
      conditions.push(lte(candidate.dateOfBirth, query.dobTo))
    }

    const propertyFilters = parsePropertyFiltersParam(query.propertyFilters)
    if (propertyFilters.length > 0) {
      const propertyCondition = await validatedPropertyFiltersCondition({
        organizationId: orgId,
        entityType: 'candidate',
        entityIdColumn: candidate.id,
        filters: propertyFilters,
      })
      if (propertyCondition) conditions.push(propertyCondition)
    }

    const where = and(...conditions)

    const [data, total] = await Promise.all([
      db
        .select({
          id: candidate.id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          displayName: candidate.displayName,
          email: candidate.email,
          phone: candidate.phone,
          gender: candidate.gender,
          dateOfBirth: candidate.dateOfBirth,
          quickNotes: candidate.quickNotes,
          createdAt: candidate.createdAt,
          updatedAt: candidate.updatedAt,
          applicationCount: sql<number>`count(${application.id})::int`,
        })
        .from(candidate)
        .leftJoin(application, eq(application.candidateId, candidate.id))
        .where(where)
        .groupBy(candidate.id)
        .orderBy(desc(candidate.createdAt))
        .limit(query.limit)
        .offset(offset),
      db.$count(candidate, where),
    ])

    // Bulk-attach properties for the current page
    const ids = data.map(c => c.id)
    const propertyMap = await loadPropertyEntriesForEntities({
      organizationId: orgId,
      entityType: 'candidate',
      entityIds: ids,
    })
    const enriched = data.map(c => ({
      ...c,
      properties: propertyMap.get(c.id) ?? [],
    }))

    return paginatedListResponse(enriched, total, query.page, query.limit)
  },
)

export default defineEventHandler(async event => {
  const session = await requirePermission(event, { candidate: ['read'] })
  const orgId = session.session.activeOrganizationId
  const query = await getValidatedQuery(event, candidateQuerySchema.parse)

  return getCachedCandidates(orgId, query)
})
