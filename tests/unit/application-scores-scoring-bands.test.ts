import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const applicationFindFirst = vi.fn()
const select = vi.fn()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requirePermission', vi.fn())
vi.stubGlobal('getValidatedRouterParams', vi.fn())
vi.stubGlobal('createError', (opts: { statusCode: number, statusMessage?: string }) => Object.assign(new Error(opts.statusMessage), opts))
vi.stubGlobal('db', {
  query: {
    application: { findFirst: applicationFindFirst },
  },
  select,
})

const getApplicationScores = (await import('../../server/api/applications/[id]/scores.get')).default as (event: unknown) => Promise<any>

function selectReturning(value: unknown) {
  const query: Record<string, unknown> = {}
  for (const method of ['from', 'leftJoin', 'where', 'orderBy', 'limit']) {
    query[method] = vi.fn(() => query)
  }
  query.then = (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => (
    Promise.resolve(value).then(resolve, reject)
  )
  return query
}

describe('application score band resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requirePermission).mockResolvedValue({
      session: { activeOrganizationId: 'org_1' },
      user: { id: 'user_1' },
    })
    vi.mocked(getValidatedRouterParams).mockResolvedValue({ id: 'app_1' })
    applicationFindFirst.mockResolvedValue({
      id: 'app_1',
      score: 65,
      jobId: 'job_1',
      currentAnalysisRunId: 'run_1',
    })
  })

  it('returns the score band from job-specific bands when a job override is configured', async () => {
    select
      .mockReturnValueOnce(selectReturning([]))
      .mockReturnValueOnce(selectReturning([{ id: 'run_1', status: 'completed', provider: 'xai', model: 'grok', compositeScore: 65, promptTokens: 1, completionTokens: 2, rawResponse: { summary: 'Neutral summary.' }, createdAt: new Date('2026-05-25T00:00:00Z') }]))
      .mockReturnValueOnce(selectReturning([{ id: 'run_1', status: 'completed', provider: 'xai', model: 'grok', compositeScore: 65, promptTokens: 1, completionTokens: 2, rawResponse: { summary: 'Neutral summary.' }, errorMessage: null, createdAt: new Date('2026-05-25T00:00:00Z') }]))
      .mockReturnValueOnce(selectReturning([{
        globalBands: [
          { label: 'Global Low', minScore: 0, maxScore: 69, color: 'warning' },
          { label: 'Global High', minScore: 70, maxScore: 100, color: 'success' },
        ],
        jobBands: [
          { label: 'Job Low', minScore: 0, maxScore: 59, color: 'danger' },
          { label: 'Job High', minScore: 60, maxScore: 100, color: 'success' },
        ],
      }]))

    const result = await getApplicationScores({})

    expect(result.scoreBand).toEqual({ label: 'Job High', minScore: 60, maxScore: 100, color: 'success' })
    expect(result.scoringBands).toEqual([
      { label: 'Job Low', minScore: 0, maxScore: 59, color: 'danger' },
      { label: 'Job High', minScore: 60, maxScore: 100, color: 'success' },
    ])
    expect(result.latestSuccessfulRun.summary).toBe('Neutral summary.')
    expect(result.latestAttempt.status).toBe('completed')
  })

  it('falls back to global defaults when job-specific bands are null', async () => {
    select
      .mockReturnValueOnce(selectReturning([]))
      .mockReturnValueOnce(selectReturning([]))
      .mockReturnValueOnce(selectReturning([]))
      .mockReturnValueOnce(selectReturning([{
        globalBands: [
          { label: 'Global Low', minScore: 0, maxScore: 69, color: 'warning' },
          { label: 'Global High', minScore: 70, maxScore: 100, color: 'success' },
        ],
        jobBands: null,
      }]))

    const result = await getApplicationScores({})

    expect(result.scoreBand).toEqual({ label: 'Global Low', minScore: 0, maxScore: 69, color: 'warning' })
    expect(result.latestSuccessfulRun).toBeNull()
    expect(result.latestAttempt).toBeNull()
  })

  it('presents the current completed run for the persisted score while retaining failed attempts in audit history', () => {
    const scoresSource = readFileSync(
      join(process.cwd(), 'server/api/applications/[id]/scores.get.ts'),
      'utf8',
    )
    const auditSource = readFileSync(
      join(process.cwd(), 'server/api/ai-analysis/stats.get.ts'),
      'utf8',
    )

    expect(scoresSource).toContain('latestSuccessfulRun')
    expect(scoresSource).toContain('latestAttempt')
    expect(scoresSource).toContain("eq(analysisRun.status, 'completed')")
    expect(auditSource).toContain("eq(analysisRun.status, 'failed')")
    expect(auditSource).toContain('recentRuns')
  })
})
