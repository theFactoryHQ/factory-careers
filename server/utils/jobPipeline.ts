import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { z } from 'zod'
import { application, applicationSearchDocument, candidate, interview, job } from '../database/schema'
import { emptyJobPipelineStageCounts, type JobPipelineResponse } from '~~/shared/job-pipeline'
import { applicationContentSearchCondition } from './applicationSearch'
import { db } from './db'
import {
  buildPropertyFiltersCondition,
  loadPropertyEntriesForEntities,
  loadVisiblePropertyDefinitionIds,
  validatePropertyFilterDefinitions,
} from './properties'
import { parsePropertyFiltersParam } from './propertyFilters'
import type { jobPipelineQuerySchema } from './schemas/jobPipeline'

export type JobPipelineQuery = z.infer<typeof jobPipelineQuerySchema>

function escapedLikePattern(value: string): string {
  return `%${value.trim().replace(/[%_\\]/g, '\\$&')}%`
}

function scheduledInterviewExists(organizationId: string): SQL<boolean> {
  return sql<boolean>`exists (
    select 1 from ${interview}
    where ${interview.organizationId} = ${organizationId}
      and ${interview.applicationId} = ${application.id}
      and ${interview.status} = 'scheduled'
  )`
}

function pipelineOrder(sort: JobPipelineQuery['sort']): SQL[] {
  switch (sort) {
    case 'date-asc':
      return [asc(application.createdAt), asc(application.id)]
    case 'name-asc':
      return [
        sql`lower(${candidate.firstName}) asc`,
        sql`lower(${candidate.lastName}) asc`,
        asc(application.id),
      ]
    case 'name-desc':
      return [
        sql`lower(${candidate.firstName}) desc`,
        sql`lower(${candidate.lastName}) desc`,
        asc(application.id),
      ]
    case 'score-asc':
      return [sql`${application.score} asc nulls last`, asc(application.id)]
    case 'score-desc':
      return [sql`${application.score} desc nulls last`, asc(application.id)]
    case 'updated-desc':
      return [desc(application.updatedAt), asc(application.id)]
    case 'date-desc':
    default:
      return [desc(application.createdAt), asc(application.id)]
  }
}

/** @internal Exported so PostgreSQL integration tests can use an isolated database. */
export async function loadJobPipeline(
  input: {
    organizationId: string
    jobId: string
    query: JobPipelineQuery
  },
  database: typeof db = db,
): Promise<JobPipelineResponse<Date> | null> {
  const existingJob = await database.query.job.findFirst({
    where: and(
      eq(job.id, input.jobId),
      eq(job.organizationId, input.organizationId),
    ),
    columns: { id: true },
  })
  if (!existingJob) return null

  const scheduled = scheduledInterviewExists(input.organizationId)
  const nonStageConditions: SQL[] = [
    eq(application.organizationId, input.organizationId),
    eq(application.jobId, input.jobId),
  ]

  if (input.query.search) {
    const condition = applicationContentSearchCondition(input.query.search, input.organizationId)
    if (condition) nonStageConditions.push(condition)
  }
  if (input.query.candidateSearch) {
    const pattern = escapedLikePattern(input.query.candidateSearch)
    nonStageConditions.push(or(
      ilike(candidate.firstName, pattern),
      ilike(candidate.lastName, pattern),
      ilike(candidate.email, pattern),
      ilike(sql`${candidate.firstName} || ' ' || ${candidate.lastName}`, pattern),
    )!)
  }
  if (input.query.score === 'high') nonStageConditions.push(gte(application.score, 75))
  if (input.query.score === 'medium') {
    nonStageConditions.push(gte(application.score, 40), lt(application.score, 75))
  }
  if (input.query.score === 'low') nonStageConditions.push(lt(application.score, 40))
  if (input.query.score === 'none') nonStageConditions.push(isNull(application.score))
  if (input.query.interviews === 'has-interview') nonStageConditions.push(scheduled)
  if (input.query.interviews === 'no-interview') nonStageConditions.push(sql`not (${scheduled})`)

  const propertyFilters = parsePropertyFiltersParam(input.query.propertyFilters)
  if (propertyFilters.length > 0) {
    await validatePropertyFilterDefinitions({
      organizationId: input.organizationId,
      entityType: 'application',
      jobId: input.jobId,
      filters: propertyFilters,
    }, definitionInput => loadVisiblePropertyDefinitionIds(definitionInput, database))
    const propertyCondition = buildPropertyFiltersCondition({
      organizationId: input.organizationId,
      entityType: 'application',
      entityIdColumn: application.id,
      filters: propertyFilters,
    })
    if (propertyCondition) nonStageConditions.push(propertyCondition)
  }

  const nonStageWhere = and(...nonStageConditions)
  let stageCountsQuery = database
    .select({ status: application.status, count: sql<number>`count(*)::int` })
    .from(application)
    .innerJoin(candidate, and(
      eq(candidate.id, application.candidateId),
      eq(candidate.organizationId, input.organizationId),
    ))
    .innerJoin(job, and(
      eq(job.id, application.jobId),
      eq(job.organizationId, input.organizationId),
    ))
  if (input.query.search) {
    stageCountsQuery = stageCountsQuery.innerJoin(applicationSearchDocument, and(
      eq(applicationSearchDocument.applicationId, application.id),
      eq(applicationSearchDocument.organizationId, input.organizationId),
    ))
  }
  const stageRows = await stageCountsQuery
    .where(nonStageWhere)
    .groupBy(application.status)
  const stageCounts = emptyJobPipelineStageCounts()
  for (const row of stageRows) stageCounts[row.status] = row.count

  const rowsWhere = and(nonStageWhere, eq(application.status, input.query.stage))
  let rowsQuery = database
    .select({
      id: application.id,
      status: application.status,
      score: application.score,
      candidateId: application.candidateId,
      candidateFirstName: candidate.firstName,
      candidateLastName: candidate.lastName,
      candidateEmail: candidate.email,
      hasScheduledInterview: scheduled,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      totalCount: sql<number>`count(*) over()::int`,
    })
    .from(application)
    .innerJoin(candidate, and(
      eq(candidate.id, application.candidateId),
      eq(candidate.organizationId, input.organizationId),
    ))
    .innerJoin(job, and(
      eq(job.id, application.jobId),
      eq(job.organizationId, input.organizationId),
    ))
  if (input.query.search) {
    rowsQuery = rowsQuery.innerJoin(applicationSearchDocument, and(
      eq(applicationSearchDocument.applicationId, application.id),
      eq(applicationSearchDocument.organizationId, input.organizationId),
    ))
  }
  const rows = await rowsQuery
    .where(rowsWhere)
    .orderBy(...pipelineOrder(input.query.sort))
    .limit(input.query.limit)
    .offset((input.query.page - 1) * input.query.limit)

  let total = rows[0]?.totalCount ?? 0
  if (rows.length === 0 && input.query.page > 1) {
    let countQuery = database
      .select({ count: sql<number>`count(*)::int` })
      .from(application)
      .innerJoin(candidate, and(
        eq(candidate.id, application.candidateId),
        eq(candidate.organizationId, input.organizationId),
      ))
      .innerJoin(job, and(
        eq(job.id, application.jobId),
        eq(job.organizationId, input.organizationId),
      ))
    if (input.query.search) {
      countQuery = countQuery.innerJoin(applicationSearchDocument, and(
        eq(applicationSearchDocument.applicationId, application.id),
        eq(applicationSearchDocument.organizationId, input.organizationId),
      ))
    }
    const [fallback] = await countQuery.where(rowsWhere)
    total = fallback?.count ?? 0
  }

  const pageRows = rows.map(({ totalCount: _totalCount, ...row }) => row)
  const applicationIds = pageRows.map(row => row.id)
  const propertyMap = await loadPropertyEntriesForEntities({
    organizationId: input.organizationId,
    entityType: 'application',
    entityIds: applicationIds,
    jobIds: [input.jobId],
    entityJobIds: new Map(pageRows.map(row => [row.id, input.jobId] as const)),
  }, database)

  return {
    data: pageRows.map(row => ({ ...row, properties: propertyMap.get(row.id) ?? [] })),
    total,
    page: input.query.page,
    limit: input.query.limit,
    stageCounts,
  }
}
