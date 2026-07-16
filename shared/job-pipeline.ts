import { APPLICATION_STATUSES, emptyPipelineCounts, type ApplicationStatus, type PipelineCounts } from './application-status'
import type { PropertyDefinition, PropertyEntry, PropertyFilter } from './properties'

export const JOB_PIPELINE_SORT_VALUES = [
  'date-desc',
  'date-asc',
  'name-asc',
  'name-desc',
  'score-desc',
  'score-asc',
  'updated-desc',
] as const
export type JobPipelineSort = typeof JOB_PIPELINE_SORT_VALUES[number]

export const JOB_PIPELINE_SCORE_FILTER_VALUES = ['all', 'high', 'medium', 'low', 'none'] as const
export type JobPipelineScoreFilter = typeof JOB_PIPELINE_SCORE_FILTER_VALUES[number]

export const JOB_PIPELINE_INTERVIEW_FILTER_VALUES = ['all', 'has-interview', 'no-interview'] as const
export type JobPipelineInterviewFilter = typeof JOB_PIPELINE_INTERVIEW_FILTER_VALUES[number]

export type JobPipelinePropertyDefinition<TDate extends string | Date = string> = Omit<
  PropertyDefinition,
  'createdAt' | 'updatedAt'
> & {
  createdAt: TDate
  updatedAt: TDate
}

export type JobPipelinePropertyEntry<TDate extends string | Date = string> = Omit<
  PropertyEntry,
  'definition'
> & {
  definition: JobPipelinePropertyDefinition<TDate>
}

/**
 * Pipeline dates are ISO strings on the wire. Server loaders use the same
 * contract with `Date` so Nitro owns the single serialization boundary.
 */
export type JobPipelineApplication<TDate extends string | Date = string> = {
  id: string
  status: ApplicationStatus
  score: number | null
  candidateId: string
  candidateFirstName: string
  candidateLastName: string
  candidateEmail: string
  hasScheduledInterview: boolean
  createdAt: TDate
  updatedAt: TDate
  properties: JobPipelinePropertyEntry<TDate>[]
}

export type JobPipelineResponse<TDate extends string | Date = string> = {
  data: JobPipelineApplication<TDate>[]
  total: number
  page: number
  limit: number
  stageCounts: PipelineCounts
}

export type JobPipelineRequest = {
  jobId: string
  page?: number
  limit?: number
  stage?: ApplicationStatus
  search?: string
  candidateSearch?: string
  score?: JobPipelineScoreFilter
  interviews?: JobPipelineInterviewFilter
  sort?: JobPipelineSort
  propertyFilters?: PropertyFilter[] | string
}

export function emptyJobPipelineStageCounts(): PipelineCounts {
  return emptyPipelineCounts()
}

/** Stable filter identity used to fence incremental requests; page is intentionally excluded. */
export function jobPipelineRequestFingerprint(request: JobPipelineRequest): string {
  const propertyFilters = typeof request.propertyFilters === 'string'
    ? request.propertyFilters
    : request.propertyFilters && request.propertyFilters.length > 0
      ? JSON.stringify(request.propertyFilters)
      : undefined

  return JSON.stringify({
    jobId: request.jobId,
    limit: request.limit ?? 25,
    stage: request.stage ?? APPLICATION_STATUSES[0],
    search: request.search?.trim() || undefined,
    candidateSearch: request.candidateSearch?.trim() || undefined,
    score: request.score ?? 'all',
    interviews: request.interviews ?? 'all',
    sort: request.sort ?? 'score-desc',
    propertyFilters,
  })
}

export function mergeJobPipelinePages(
  current: JobPipelineResponse,
  next: JobPipelineResponse,
): JobPipelineResponse {
  const byId = new Map(current.data.map(application => [application.id, application]))
  for (const application of next.data) byId.set(application.id, application)

  return {
    ...next,
    data: [...byId.values()],
  }
}
