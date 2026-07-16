import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  analysisRun,
  analysisRunCriterionScore,
  criterionScore,
  job,
} from '../../server/database/schema'

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

function collectSqlParamValues(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') return []
  if (value.constructor?.name === 'Param' && 'value' in value) {
    return [(value as { value: unknown }).value]
  }
  if ('queryChunks' in value && Array.isArray((value as { queryChunks?: unknown[] }).queryChunks)) {
    return (value as { queryChunks: unknown[] }).queryChunks.flatMap(collectSqlParamValues)
  }
  if (Array.isArray(value)) return value.flatMap(collectSqlParamValues)
  return []
}

function generationAwareSelectQuery() {
  let selectedTable: unknown
  let result: unknown = []

  const scoreA = {
    criterionKey: 'reliability',
    maxScore: 10,
    score: 8,
    confidence: 90,
    evidence: 'Run A evidence',
    strengths: ['Run A strength'],
    gaps: [],
  }
  const liveScoreB = { ...scoreA, score: 2, evidence: 'Run B live evidence' }
  const runA = {
    id: 'run_A',
    status: 'completed',
    provider: 'openai',
    model: 'model-A',
    compositeScore: 82,
    promptTokens: 100,
    completionTokens: 25,
    criteriaSnapshot: [{
      key: 'reliability',
      name: 'Run A reliability',
      weight: 85,
      category: 'experience',
      maxScore: 10,
      description: 'Snapshot A',
    }],
    rawResponse: { summary: 'Run A summary' },
    createdAt: new Date('2026-07-16T12:00:00Z'),
  }
  const newerRunB = {
    ...runA,
    id: 'run_B',
    model: 'model-B',
    compositeScore: 20,
    rawResponse: { summary: 'Run B summary' },
    createdAt: new Date('2026-07-16T13:00:00Z'),
  }

  const query: Record<string, unknown> = {}
  query.from = vi.fn((table: unknown) => {
    selectedTable = table
    if (table === analysisRunCriterionScore) result = [scoreA]
    else if (table === criterionScore) result = [liveScoreB]
    else if (table === analysisRun) result = [newerRunB]
    else if (table === job) result = [{ globalBands: null, jobBands: null }]
    return query
  })
  query.leftJoin = vi.fn(() => query)
  query.where = vi.fn((condition: unknown) => {
    if (selectedTable === analysisRun) {
      result = collectSqlParamValues(condition).includes('run_A') ? [runA] : [newerRunB]
    }
    return query
  })
  query.orderBy = vi.fn(() => query)
  query.limit = vi.fn(() => query)
  query.then = (resolve: (rows: unknown) => unknown, reject: (error: unknown) => unknown) => (
    Promise.resolve(result).then(resolve, reject)
  )
  return query
}

describe('application score run display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requirePermission).mockResolvedValue({
      session: { activeOrganizationId: 'org_1' },
      user: { id: 'user_1' },
    })
    vi.mocked(getValidatedRouterParams).mockResolvedValue({ id: 'app_1' })
    applicationFindFirst.mockResolvedValue({
      id: 'app_1',
      score: 82,
      jobId: 'job_1',
      currentAnalysisRunId: 'run_success',
    })
  })

  it('returns the latest successful run separately from a newer failed attempt', async () => {
    const successfulRun = {
      id: 'run_success',
      status: 'completed',
      provider: 'openai',
      model: 'gpt-5',
      compositeScore: 82,
      promptTokens: 100,
      completionTokens: 25,
      rawResponse: { summary: 'Strong match.' },
      errorMessage: null,
      createdAt: new Date('2026-07-16T12:00:00Z'),
    }
    const failedAttempt = {
      id: 'run_failed',
      status: 'failed',
      provider: 'openai',
      model: 'gpt-5',
      compositeScore: null,
      promptTokens: null,
      completionTokens: null,
      rawResponse: null,
      errorMessage: 'Provider unavailable',
      createdAt: new Date('2026-07-16T13:00:00Z'),
    }

    select
      .mockReturnValueOnce(selectReturning([]))
      .mockReturnValueOnce(selectReturning([successfulRun]))
      .mockReturnValueOnce(selectReturning([failedAttempt]))
      .mockReturnValueOnce(selectReturning([{ globalBands: null, jobBands: null }]))

    const result = await getApplicationScores({})

    expect(result.applicationId).toBe('app_1')
    expect(result.compositeScore).toBe(82)
    expect(result.latestSuccessfulRun).toMatchObject({
      id: 'run_success',
      status: 'completed',
      compositeScore: 82,
      summary: 'Strong match.',
    })
    expect(result.latestAttempt).toMatchObject({
      id: 'run_failed',
      status: 'failed',
    })
    expect(result.latestAttempt).not.toHaveProperty('errorMessage')
    expect(result).not.toHaveProperty('latestRun')
  })

  it('binds score metadata and immutable criterion rows to the application current-run pointer', async () => {
    applicationFindFirst.mockResolvedValue({
      id: 'app_1',
      score: 82,
      jobId: 'job_1',
      currentAnalysisRunId: 'run_A',
    })
    select.mockImplementation(() => generationAwareSelectQuery())

    const result = await getApplicationScores({})

    expect(result.compositeScore).toBe(82)
    expect(result.latestSuccessfulRun).toMatchObject({
      id: 'run_A',
      model: 'model-A',
      compositeScore: 82,
      summary: 'Run A summary',
    })
    expect(result.scores).toEqual([
      expect.objectContaining({
        score: 8,
        evidence: 'Run A evidence',
        criterionName: 'Run A reliability',
        weight: 85,
        category: 'experience',
      }),
    ])
    expect(result.latestAttempt).toMatchObject({
      id: 'run_B',
      model: 'model-B',
      compositeScore: 20,
    })
  })

  it('keeps both analysis-run lookups tenant scoped', () => {
    const source = readFileSync(
      join(process.cwd(), 'server/api/applications/[id]/scores.get.ts'),
      'utf8',
    )

    expect(source.match(/eq\(analysisRun\.organizationId, orgId\)/g)).toHaveLength(2)
    expect(source).not.toContain('analysisRun.errorMessage')
    expect(source).not.toContain('scoringCriterion')
    expect(source).toContain('parseCriteriaSnapshot')
  })

  it('renders successful score metadata and a separate latest-attempt failure notice', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/components/ScoreBreakdown.vue'),
      'utf8',
    )

    expect(source).toContain('latestSuccessfulRun')
    expect(source).toContain('latestFailureAttempt')
    expect(source).toContain('Latest re-score failed')
    expect(source).toContain('The last successful score is still shown.')
    expect(source).toContain('No score was saved. Try running the analysis again.')
    expect(source).toContain('resolvedScoreData.value?.compositeScore ?? latestSuccessfulRun.value?.compositeScore')
    expect(source).not.toContain('resolvedScoreData!.latestRun')
    expect(source.match(/await refresh\(\)/g)).toHaveLength(2)

    const scoreTemplateEnd = source.indexOf('\n    </template>\n\n    <div\n      v-if="latestFailureAttempt"')
    expect(scoreTemplateEnd).toBeGreaterThan(-1)
    expect(source.indexOf('v-if="latestFailureAttempt"')).toBeGreaterThan(scoreTemplateEnd)
  })

  it('keeps cached score data and interactive state scoped to the current application', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/components/ScoreBreakdown.vue'),
      'utf8',
    )

    expect(source).toContain('type CachedScoreData')
    expect(source).toContain('applicationId: val.applicationId')
    expect(source).toContain('cachedScoreData.value?.applicationId === props.applicationId')
    expect(source).toContain('watch(() => props.applicationId')
    expect(source).toContain('scoreData.value?.applicationId === applicationId')
    expect(source).toContain('cachedScoreData.value = null')
    expect(source).toContain('expandedCriterion.value = null')
    expect(source).toContain('analyzeError.value = null')
    expect(source).toContain('parseFailedDocId.value = null')
    expect(source).toContain('isRetryingParse.value = false')
    expect(source).toContain('isAnalyzing.value = false')
    expect(source).toContain('const applicationId = props.applicationId')
    expect(source).toContain('if (applicationId !== props.applicationId) return')
    expect(source).toContain('`/api/applications/${applicationId}/analyze`')
    expect(source).not.toContain('const cachedScoreData = ref(scoreData.value)')
    expect(source).toContain('key: computed(() => `scores-${props.applicationId}`)')
    expect(source).toContain('watch: [() => props.applicationId]')
  })

  it('uses the successful run for summaries and scoring feedback across application views', () => {
    const composable = readFileSync(
      join(process.cwd(), 'app/composables/useApplicationScoringData.ts'),
      'utf8',
    )
    const drawer = readFileSync(
      join(process.cwd(), 'app/components/ApplicationDetailDrawer.vue'),
      'utf8',
    )
    const page = readFileSync(
      join(process.cwd(), 'app/pages/dashboard/applications/[id].vue'),
      'utf8',
    )

    expect(composable).toContain('latestSuccessfulRun?:')
    expect(composable).toContain('scoringData.value?.latestSuccessfulRun?.summary')
    expect(drawer).toContain(':analysis-run-id="scoringData?.latestSuccessfulRun?.id ?? null"')
    expect(page).toContain(':analysis-run-id="scoringData?.latestSuccessfulRun?.id ?? null"')
    expect(composable).not.toContain('latestRun?:')
  })

  it('persists and deterministically backfills the current completed analysis run', () => {
    const migrationPath = join(process.cwd(), 'server/database/migrations/0056_application_current_analysis_run.sql')
    const schema = readFileSync(join(process.cwd(), 'server/database/schema/app.ts'), 'utf8')

    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return

    const migration = readFileSync(migrationPath, 'utf8')
    const journal = readFileSync(join(process.cwd(), 'server/database/migrations/meta/_journal.json'), 'utf8')

    expect(schema).toContain("currentAnalysisRunId: text('current_analysis_run_id')")
    expect(schema).toContain("unique('analysis_run_org_application_id_unique')")
    expect(migration).toContain('ADD COLUMN "current_analysis_run_id" text')
    expect(migration).toContain("analysis_run.status = 'completed'")
    expect(migration).toContain('analysis_run.composite_score IS NOT DISTINCT FROM application.score')
    expect(migration).toContain('ORDER BY analysis_run.created_at DESC, analysis_run.id DESC')
    expect(migration).toContain('UNIQUE ("organization_id", "application_id", "id")')
    expect(migration).toContain('FOREIGN KEY ("organization_id", "id", "current_analysis_run_id")')
    expect(migration).toContain('REFERENCES "public"."analysis_run"("organization_id", "application_id", "id")')
    expect(migration).toContain('ON DELETE SET NULL ("current_analysis_run_id")')
    expect(migration).toContain('analysis_run_criterion_score')
    expect(journal).toContain('"tag": "0056_application_current_analysis_run"')
  })
})
