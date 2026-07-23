import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { application, applicationSearchDocument, candidate, job } from '../../database/schema'
import {
  paginatedListResponse,
  paginationOffset,
} from '../../utils/schemas/common'
import { applicationQuerySchema } from '../../utils/schemas/application'
import { loadPropertyEntriesForEntities, validatedPropertyFiltersCondition } from '../../utils/properties'
import { parsePropertyFiltersParam } from '../../utils/propertyFilters'
import { applicationContentSearchCondition } from '../../utils/applicationSearch'

/**
 * GET /api/applications
 * List applications for the current organization.
 * Filterable by jobId, candidateId, status, full application content, and custom properties. Paginated.
 */
const getCachedApplications = defineOrgScopedCachedFunction(
  'applications-list',
  async (orgId, query: z.infer<typeof applicationQuerySchema>) => {
    const offset = paginationOffset(query.page, query.limit)
    const conditions = [eq(application.organizationId, orgId)]

    if (query.jobId) {
      conditions.push(eq(application.jobId, query.jobId))
    }
    if (query.candidateId) {
      conditions.push(eq(application.candidateId, query.candidateId))
    }
    if (query.status) {
      conditions.push(eq(application.status, query.status))
    }
    if (query.search) {
      const searchCondition = applicationContentSearchCondition(query.search, orgId)
      if (searchCondition) conditions.push(searchCondition)
    }

    const propertyFilters = parsePropertyFiltersParam(query.propertyFilters)
    if (propertyFilters.length > 0) {
      const propertyCondition = await validatedPropertyFiltersCondition({
        organizationId: orgId,
        entityType: 'application',
        jobId: query.jobId,
        entityIdColumn: application.id,
        filters: propertyFilters,
      })
      if (propertyCondition) conditions.push(propertyCondition)
    }

    const where = and(...conditions)
    const direction = query.sortDir === 'asc' ? asc : desc
    const scoreWithNullFallback = sql<number>`coalesce(${application.score}, -1)`
    const orderBy = (() => {
      switch (query.sortBy) {
        case 'name':
          return [
            direction(candidate.firstName),
            direction(candidate.lastName),
            direction(application.id),
          ]
        case 'email':
          return [direction(candidate.email), direction(application.id)]
        case 'job':
          return [direction(job.title), direction(application.id)]
        case 'status':
          return [direction(application.status), direction(application.id)]
        case 'score':
          return [direction(scoreWithNullFallback), direction(application.id)]
        case 'created':
          return [direction(application.createdAt), direction(application.id)]
      }
    })()

    let rowsQuery = db
      .select({
        id: application.id,
        status: application.status,
        score: application.score,
        notes: application.notes,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        candidateId: application.candidateId,
        candidateFirstName: candidate.firstName,
        candidateLastName: candidate.lastName,
        candidateEmail: candidate.email,
        jobId: application.jobId,
        jobTitle: job.title,
        jobStatus: job.status,
        totalCount: sql<number>`count(*) over()::int`,
      })
      .from(application)
      .innerJoin(candidate, and(
        eq(candidate.id, application.candidateId),
        eq(candidate.organizationId, orgId),
      ))
      .innerJoin(job, and(
        eq(job.id, application.jobId),
        eq(job.organizationId, orgId),
      ))

    // Normal list loads must not depend on the optional search index. Besides
    // avoiding an unnecessary join, this keeps the recruiting pipeline
    // available while a newly deployed search-index migration is converging.
    if (query.search) {
      rowsQuery = rowsQuery.innerJoin(applicationSearchDocument, and(
        eq(applicationSearchDocument.applicationId, application.id),
        eq(applicationSearchDocument.organizationId, orgId),
      ))
    }

    const rows = await rowsQuery
      .where(where)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(offset)

    // A window count avoids re-running the content search for every normal page.
    // Preserve the paginated API contract for an out-of-range page with one
    // fallback count query, a path the pipeline never uses.
    let total = rows[0]?.totalCount ?? 0
    if (rows.length === 0 && query.page > 1) {
      let countQuery = db
        .select({ count: sql<number>`count(*)::int` })
        .from(application)
        .innerJoin(candidate, and(
          eq(candidate.id, application.candidateId),
          eq(candidate.organizationId, orgId),
        ))
        .innerJoin(job, and(
          eq(job.id, application.jobId),
          eq(job.organizationId, orgId),
        ))

      if (query.search) {
        countQuery = countQuery.innerJoin(applicationSearchDocument, and(
          eq(applicationSearchDocument.applicationId, application.id),
          eq(applicationSearchDocument.organizationId, orgId),
        ))

      }

      const [fallbackTotal] = await countQuery
        .where(where)
      total = fallbackTotal?.count ?? 0
    }

    const data = rows.map(({ totalCount: _totalCount, ...row }) => row)

    // Bulk-attach properties for the current page (org-global + per-job)
    const ids = data.map(a => a.id)
    const jobIds = [...new Set(data.map(a => a.jobId))]
    const entityJobIds = new Map(data.map(a => [a.id, a.jobId] as const))
    const propertyMap = await loadPropertyEntriesForEntities({
      organizationId: orgId,
      entityType: 'application',
      entityIds: ids,
      jobIds,
      entityJobIds,
    })
    const enriched = data.map(a => ({
      ...a,
      properties: propertyMap.get(a.id) ?? [],
    }))

    return paginatedListResponse(enriched, total, query.page, query.limit)
  },
)

export default defineEventHandler(async event => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const query = await getValidatedQuery(event, applicationQuerySchema.parse)

  return getCachedApplications(orgId, query)
})
