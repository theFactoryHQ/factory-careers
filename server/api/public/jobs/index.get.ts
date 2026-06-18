import type { SQL } from 'drizzle-orm'
import { eq, and, desc, ilike, lte, or, sql } from 'drizzle-orm'
import { job } from '../../../database/schema'
import { publicJobsQuerySchema } from '../../../utils/schemas/publicApplication'
import { getPublicJobScopeCondition } from '../../../utils/publicJobScope'
import type { FactoryDivision, JobDescriptionBlock } from '~~/shared/job-listing-structure'

type PublicJobsQuery = Awaited<ReturnType<typeof publicJobsQuerySchema.parseAsync>>

type PublicJobRow = {
  id: string
  title: string
  slug: string
  description: string | null
  divisions: FactoryDivision[]
  descriptionBlocks: JobDescriptionBlock[]
  location: string | null
  type: string
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  salaryUnit: string | null
  salaryNegotiable?: boolean | null
  salaryDisplayOnListing: boolean
  remoteStatus: string | null
  activeFrom?: Date | string | null
  createdAt: Date | string
  organization?: { name?: string | null } | null
}

function isMissingActiveFromColumn(error: unknown) {
  if (typeof error !== 'object' || error === null) return false

  const queryError = error as { code?: string, message?: string, cause?: { code?: string, message?: string } }
  const message = `${queryError.message ?? ''} ${queryError.cause?.message ?? ''}`

  return (queryError.code === '42703' || queryError.cause?.code === '42703' || message.includes('Failed query'))
    && message.includes('active_from')
}

function buildDivisionFilter(divisions?: FactoryDivision[]) {
  if (!divisions?.length) return undefined
  return sql`${job.divisions} ?| array[${sql.join(divisions.map((division) => sql`${division}`), sql`, `)}]`
}

function buildPublicJobsWhere(query: PublicJobsQuery, includeActiveFrom: boolean, organizationScope?: SQL) {
  // Always filter to open jobs only. Older local databases may not have active_from yet.
  const conditions = [eq(job.status, 'open')]

  if (organizationScope) conditions.push(organizationScope)

  if (includeActiveFrom) conditions.push(lte(job.activeFrom, new Date()))

  // Optional search — matches title OR location
  if (query.search) {
    // Escape LIKE meta-characters to prevent pattern injection
    const escaped = query.search.replace(/[%_\\]/g, '\\$&')
    const pattern = `%${escaped}%`
    conditions.push(
      or(
        ilike(job.title, pattern),
        ilike(job.location, pattern),
      )!,
    )
  }

  // Optional type filter
  if (query.type) {
    conditions.push(eq(job.type, query.type))
  }

  const divisionFilter = buildDivisionFilter(query.divisions)
  if (divisionFilter) conditions.push(divisionFilter)

  // Optional location filter
  if (query.location) {
    // Escape LIKE meta-characters to prevent pattern injection
    const escapedLoc = query.location.replace(/[%_\\]/g, '\\$&')
    conditions.push(ilike(job.location, `%${escapedLoc}%`))
  }

  return and(...conditions)
}

async function listPublicJobs(query: PublicJobsQuery, offset: number, includeActiveFrom: boolean, organizationScope?: SQL) {
  const where = buildPublicJobsWhere(query, includeActiveFrom, organizationScope)

  const columns = includeActiveFrom
    ? {
        id: true,
        title: true,
        slug: true,
        description: true,
        divisions: true,
        descriptionBlocks: true,
        location: true,
        type: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        salaryUnit: true,
        salaryNegotiable: true,
        salaryDisplayOnListing: true,
        remoteStatus: true,
        activeFrom: true,
        createdAt: true,
      }
    : {
        id: true,
        title: true,
        slug: true,
        description: true,
        divisions: true,
        descriptionBlocks: true,
        location: true,
        type: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        salaryUnit: true,
        salaryNegotiable: true,
        salaryDisplayOnListing: true,
        remoteStatus: true,
        createdAt: true,
      }

  const [data, total] = await Promise.all([
    db.query.job.findMany({
      where,
      limit: query.limit,
      offset,
      orderBy: [includeActiveFrom ? desc(job.activeFrom) : desc(job.createdAt)],
      columns,
      with: {
        organization: {
          columns: { name: true },
        },
      },
    }),
    db.$count(job, where),
  ])

  const rows = data as PublicJobRow[]

  // Flatten org name into each job object. Legacy schemas fall back to createdAt for posted dates.
  const flatData = rows.map(({ organization: org, ...j }) => stripSalaryForHiddenListing({
    ...j,
    activeFrom: j.activeFrom ?? j.createdAt,
    organizationName: org?.name ?? null,
  }))

  return { data: flatData, total }
}

/**
 * GET /api/public/jobs
 * Lists all open jobs with pagination, search, and type filter.
 * No auth required — this is the public-facing job board endpoint.
 */
export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, publicJobsQuerySchema.parse)
  const organizationScope = await getPublicJobScopeCondition()

  const offset = (query.page - 1) * query.limit

  try {
    const result = await listPublicJobs(query, offset, true, organizationScope)
    return { ...result, page: query.page, limit: query.limit }
  }
  catch (error) {
    if (!isMissingActiveFromColumn(error)) throw error

    const result = await listPublicJobs(query, offset, false, organizationScope)
    return { ...result, page: query.page, limit: query.limit }
  }
})
