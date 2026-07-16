import { describe, expect, it } from 'vitest'
import { jobPipelineQuerySchema } from '../../server/utils/schemas/jobPipeline'
import {
  emptyJobPipelineStageCounts,
  jobPipelineRequestFingerprint,
  mergeJobPipelinePages,
  type JobPipelineResponse,
} from '../../shared/job-pipeline'

function response(
  data: JobPipelineResponse['data'],
  page: number,
  total = data.length,
): JobPipelineResponse {
  return {
    data,
    total,
    page,
    limit: 2,
    stageCounts: { ...emptyJobPipelineStageCounts(), new: total },
  }
}

describe('job pipeline contract', () => {
  it('validates bounded pagination and supported server-side filters', () => {
    expect(jobPipelineQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 25,
      stage: 'new',
      sort: 'score-desc',
      score: 'all',
      interviews: 'all',
    })
    expect(jobPipelineQuerySchema.parse({
      limit: '50',
      stage: 'interview',
      search: '  platform engineer  ',
      candidateSearch: '  Ada  ',
      score: 'medium',
      interviews: 'has-interview',
      sort: 'name-asc',
      propertyFilters: '[]',
    })).toMatchObject({
      limit: 50,
      stage: 'interview',
      search: 'platform engineer',
      candidateSearch: 'Ada',
      score: 'medium',
      interviews: 'has-interview',
      sort: 'name-asc',
      propertyFilters: '[]',
    })
    expect(jobPipelineQuerySchema.safeParse({ limit: 51 }).success).toBe(false)
    expect(jobPipelineQuerySchema.safeParse({ search: 'ab' }).success).toBe(false)
    expect(jobPipelineQuerySchema.safeParse({ score: 'excellent' }).success).toBe(false)
  })

  it('fingerprints filters independently from the requested page', () => {
    const base = {
      jobId: 'job_1',
      stage: 'new' as const,
      limit: 25,
      sort: 'score-desc' as const,
      score: 'all' as const,
      interviews: 'all' as const,
    }
    expect(jobPipelineRequestFingerprint({ ...base, page: 1 }))
      .toBe(jobPipelineRequestFingerprint({ ...base, page: 3 }))
    expect(jobPipelineRequestFingerprint({ ...base, page: 1 }))
      .not.toBe(jobPipelineRequestFingerprint({ ...base, page: 1, stage: 'offer' }))
  })

  it('merges incremental pages without duplicating application identity', () => {
    const first = response([
      { id: 'app_1', status: 'new', score: 90, candidateId: 'cand_1', candidateFirstName: 'Ada', candidateLastName: 'Lovelace', candidateEmail: 'ada@example.com', hasScheduledInterview: false, createdAt: '2026-07-16', updatedAt: '2026-07-16', properties: [] },
      { id: 'app_2', status: 'new', score: 80, candidateId: 'cand_2', candidateFirstName: 'Grace', candidateLastName: 'Hopper', candidateEmail: 'grace@example.com', hasScheduledInterview: true, createdAt: '2026-07-15', updatedAt: '2026-07-15', properties: [] },
    ], 1, 3)
    const second = response([
      first.data[1]!,
      { id: 'app_3', status: 'new', score: null, candidateId: 'cand_3', candidateFirstName: 'Katherine', candidateLastName: 'Johnson', candidateEmail: 'kj@example.com', hasScheduledInterview: false, createdAt: '2026-07-14', updatedAt: '2026-07-14', properties: [] },
    ], 2, 3)

    expect(mergeJobPipelinePages(first, second)).toMatchObject({
      page: 2,
      total: 3,
      data: [{ id: 'app_1' }, { id: 'app_2' }, { id: 'app_3' }],
    })
  })
})
