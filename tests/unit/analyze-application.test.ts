import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
  const applicationFindFirst = vi.fn()
  const orgSettingsFindFirst = vi.fn()
  const criteriaWhere = vi.fn()
  const loadAiConfig = vi.fn()
  const loadApplicationResume = vi.fn()
  const extractResumeText = vi.fn()
  const scoreApplication = vi.fn()
  const computeCompositeScore = vi.fn()
  const recordActivity = vi.fn()

  const failedRunValues = vi.fn()
  const txInsertValues = vi.fn()
  const txInsertReturning = vi.fn()
  const txDeleteWhere = vi.fn()
  const txUpdateWhere = vi.fn()
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }))
  const txApplicationForUpdate = vi.fn()
  const txApplicationLimit = vi.fn(() => ({ for: txApplicationForUpdate }))
  const txApplicationWhere = vi.fn(() => ({ limit: txApplicationLimit }))
  const txApplicationFrom = vi.fn(() => ({ where: txApplicationWhere }))

  const tx = {
    insert: vi.fn(() => ({ values: txInsertValues })),
    delete: vi.fn(() => ({ where: txDeleteWhere })),
    update: vi.fn(() => ({ set: txUpdateSet })),
    select: vi.fn(() => ({ from: txApplicationFrom })),
  }

  const db = {
    query: {
      application: { findFirst: applicationFindFirst },
      orgSettings: { findFirst: orgSettingsFindFirst },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: criteriaWhere })),
    })),
    insert: vi.fn(() => ({ values: failedRunValues })),
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      await callback(tx)),
  }

  return {
    applicationFindFirst,
    orgSettingsFindFirst,
    criteriaWhere,
    loadAiConfig,
    loadApplicationResume,
    extractResumeText,
    scoreApplication,
    computeCompositeScore,
    recordActivity,
    failedRunValues,
    txInsertValues,
    txInsertReturning,
    txDeleteWhere,
    txUpdateWhere,
    txUpdateSet,
    txApplicationForUpdate,
    tx,
    db,
  }
})

vi.mock('../../server/utils/db', () => ({ db: harness.db }))
vi.mock('../../server/utils/ai/loadConfig', () => ({ loadAiConfig: harness.loadAiConfig }))
vi.mock('../../server/utils/applicationResume', () => ({ loadApplicationResume: harness.loadApplicationResume }))
vi.mock('../../server/utils/resume-parser', () => ({ extractResumeText: harness.extractResumeText }))
vi.mock('../../server/utils/ai/scoring', () => ({
  scoreApplication: harness.scoreApplication,
  computeCompositeScore: harness.computeCompositeScore,
}))
vi.mock('../../server/utils/recordActivity', () => ({ recordActivity: harness.recordActivity }))

const { AnalyzeApplicationError, analyzeApplication } = await import('../../server/utils/analyzeApplication')

const applicationRecord = {
  id: 'application-1',
  score: null,
  coverLetterText: 'A focused cover letter.',
  notes: 'Recruiter note.',
  candidate: { id: 'candidate-1', firstName: 'Casey', lastName: 'Candidate' },
  job: {
    id: 'job-1',
    title: 'Platform Engineer',
    description: 'Build reliable systems.',
  },
}

const criteria = [{
  id: 'criterion-row-1',
  organizationId: 'org-1',
  jobId: 'job-1',
  key: 'reliability',
  name: 'Reliability',
  description: 'Evidence of reliable systems work.',
  category: 'technical',
  maxScore: 10,
  weight: 100,
  displayOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}]

const scoring = {
  evaluations: [{
    criterionKey: 'reliability',
    maxScore: 10,
    applicantScore: 8,
    confidence: 90,
    evidence: 'Led reliable platform work.',
    strengths: ['Strong reliability experience.'],
    gaps: ['No explicit multi-region example.'],
  }],
  summary: 'Strong evidence of platform reliability work.',
}

describe('analyzeApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.applicationFindFirst.mockResolvedValue(applicationRecord)
    harness.orgSettingsFindFirst.mockResolvedValue({ analysisContext: 'Use the organization context.' })
    harness.criteriaWhere.mockResolvedValue(criteria)
    harness.loadAiConfig.mockResolvedValue({
      id: 'config-1',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKeyEncrypted: 'encrypted-key',
      baseUrl: null,
      maxTokens: 4096,
    })
    harness.loadApplicationResume.mockResolvedValue({
      id: 'resume-1',
      parsedContent: { text: 'Platform reliability resume.' },
    })
    harness.extractResumeText.mockReturnValue('Platform reliability resume.')
    harness.scoreApplication.mockResolvedValue({
      scoring,
      usage: { promptTokens: 120, completionTokens: 45 },
    })
    harness.computeCompositeScore.mockReturnValue(80)
    harness.txInsertReturning.mockResolvedValue([{ id: 'run-1' }])
    harness.txInsertValues.mockImplementation(() => ({
      returning: harness.txInsertReturning,
    }))
    harness.failedRunValues.mockResolvedValue(undefined)
    harness.txDeleteWhere.mockResolvedValue(undefined)
    harness.txUpdateWhere.mockResolvedValue(undefined)
    harness.txApplicationForUpdate.mockResolvedValue([{ score: null }])
    harness.recordActivity.mockResolvedValue(undefined)
  })

  it('scores and atomically persists a tenant-scoped application with its summary and raw response', async () => {
    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
      aiConfigId: 'config-preferred',
      scoredById: 'user-1',
    })).resolves.toEqual({
      compositeScore: 80,
      evaluations: scoring.evaluations,
      summary: scoring.summary,
      analysisRunId: 'run-1',
      usage: { promptTokens: 120, completionTokens: 45 },
    })

    expect(harness.loadAiConfig).toHaveBeenCalledWith('org-1', {
      purpose: 'analysis',
      preferId: 'config-preferred',
    })
    expect(harness.loadApplicationResume).toHaveBeenCalledWith(
      'org-1',
      'application-1',
      'candidate-1',
    )
    expect(harness.scoreApplication).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', model: 'gpt-4.1-mini' }),
      expect.objectContaining({
        criteria: [expect.objectContaining({ key: 'reliability', maxScore: 10 })],
        resumeText: 'Platform reliability resume.',
        organizationAnalysisContext: 'Use the organization context.',
      }),
      { abortSignal: undefined },
    )

    const completedRun = harness.txInsertValues.mock.calls[0]?.[0]
    expect(completedRun).toMatchObject({
      organizationId: 'org-1',
      applicationId: 'application-1',
      status: 'completed',
      compositeScore: 80,
      rawResponse: scoring,
      scoredById: 'user-1',
    })
    expect(harness.txInsertValues.mock.calls[1]?.[0]).toEqual([
      expect.objectContaining({
        organizationId: 'org-1',
        applicationId: 'application-1',
        criterionKey: 'reliability',
      }),
    ])
    expect(harness.txInsertValues.mock.calls[2]?.[0]).toEqual([
      expect.objectContaining({
        organizationId: 'org-1',
        analysisRunId: 'run-1',
        applicationId: 'application-1',
        criterionKey: 'reliability',
      }),
    ])
    expect(harness.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      score: 80,
      currentAnalysisRunId: 'run-1',
    }))
    expect(harness.recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      actorId: 'user-1',
      resourceId: 'application-1',
      action: 'scored',
    }))
  })

  it('reports an uploaded resume with unusable parsed content as a parse failure', async () => {
    harness.loadApplicationResume.mockResolvedValue({ id: 'resume-unparsed', parsedContent: null })
    harness.extractResumeText.mockReturnValue(null)

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
    })).rejects.toMatchObject({
      code: 'RESUME_PARSE_FAILED',
      documentId: 'resume-unparsed',
    })

    expect(harness.scoreApplication).not.toHaveBeenCalled()
    expect(harness.db.transaction).not.toHaveBeenCalled()
  })

  it('reports a pending parse as a retryable prerequisite without calling the provider', async () => {
    harness.loadApplicationResume.mockResolvedValue({
      id: 'resume-pending',
      parsedContent: null,
      uploadStatus: 'completed',
      parseStatus: 'pending',
      parseRetryable: true,
    })
    harness.extractResumeText.mockReturnValue(null)

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
    })).rejects.toMatchObject({
      code: 'RESUME_PARSE_PENDING',
      retryable: true,
      documentId: 'resume-pending',
    })
    expect(harness.scoreApplication).not.toHaveBeenCalled()
  })

  it('treats an exhausted retryable parse as terminal until manual reparse', async () => {
    harness.loadApplicationResume.mockResolvedValue({
      id: 'resume-exhausted',
      parsedContent: null,
      uploadStatus: 'completed',
      parseStatus: 'failed',
      parseRetryable: true,
    })
    harness.extractResumeText.mockReturnValue(null)

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
    })).rejects.toMatchObject({ code: 'RESUME_PARSE_FAILED', retryable: false })
  })

  it('maps missing or invalid AI configuration to a stable terminal prerequisite', async () => {
    harness.loadAiConfig.mockRejectedValueOnce(Object.assign(new Error('private config detail'), {
      statusCode: 422,
    }))

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
    })).rejects.toMatchObject({
      code: 'AI_CONFIGURATION_INVALID',
      message: 'AI analysis is not configured for this organization.',
      retryable: false,
    })
    expect(harness.scoreApplication).not.toHaveBeenCalled()
  })

  it('does not misclassify a statusless AI configuration database failure as terminal', async () => {
    const databaseError = new Error('connection reset while loading config')
    harness.loadAiConfig.mockRejectedValueOnce(databaseError)

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
    })).rejects.toBe(databaseError)
    expect(harness.scoreApplication).not.toHaveBeenCalled()
    expect(harness.failedRunValues).not.toHaveBeenCalled()
  })

  it('reports a missing resume separately from a parsing failure', async () => {
    harness.loadApplicationResume.mockResolvedValue(null)
    harness.extractResumeText.mockReturnValue(null)

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
    })).rejects.toMatchObject({ code: 'RESUME_MISSING' })

    expect(harness.scoreApplication).not.toHaveBeenCalled()
  })

  it('rejects analysis when the job has no scoring criteria', async () => {
    harness.criteriaWhere.mockResolvedValue([])

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
    })).rejects.toMatchObject({ code: 'MISSING_CRITERIA' })

    expect(harness.loadApplicationResume).not.toHaveBeenCalled()
    expect(harness.scoreApplication).not.toHaveBeenCalled()
  })

  it('records a provider failure as an audit run and returns a typed failure', async () => {
    harness.scoreApplication.mockRejectedValue(new Error('provider unavailable'))

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
      scoredById: 'user-1',
    })).rejects.toSatisfy((error: unknown) =>
      error instanceof AnalyzeApplicationError
      && error.code === 'PROVIDER_FAILURE'
      && error.message === 'AI provider request failed.')

    expect(harness.failedRunValues).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      applicationId: 'application-1',
      status: 'failed',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      errorMessage: 'AI provider request failed.',
      scoredById: 'user-1',
    }))
  })

  it.each([
    { statusCode: 401, retryable: false },
    { statusCode: 429, retryable: true },
    { statusCode: 503, retryable: true },
  ])('classifies provider status $statusCode without leaking its response', async ({ statusCode, retryable }) => {
    harness.scoreApplication.mockRejectedValueOnce(Object.assign(
      new Error('private provider response'),
      { statusCode },
    ))

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
    })).rejects.toMatchObject({
      code: 'PROVIDER_FAILURE',
      message: 'AI provider request failed.',
      retryable,
    })
    expect(JSON.stringify(harness.failedRunValues.mock.calls)).not.toContain('private provider response')
  })

  it('retries unknown provider codes within the bounded queue attempts', async () => {
    harness.scoreApplication.mockRejectedValueOnce(Object.assign(
      new Error('private provider response'),
      { code: 'SOME_PROVIDER_CODE' },
    ))

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
    })).rejects.toMatchObject({ code: 'PROVIDER_FAILURE', retryable: true })
  })

  it('suppresses unfenced failed-run writes for claimed queue work', async () => {
    harness.scoreApplication.mockRejectedValueOnce(new Error('private provider response'))

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
      recordFailedRun: false,
    })).rejects.toMatchObject({ code: 'PROVIDER_FAILURE' })

    expect(harness.failedRunValues).not.toHaveBeenCalled()
  })

  it('preserves the latest successful score metadata when a later provider attempt fails', async () => {
    await analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
      scoredById: 'user-1',
    })
    const successfulRun = structuredClone(harness.txInsertValues.mock.calls[0]?.[0])

    harness.scoreApplication.mockRejectedValueOnce(new Error('temporary provider outage'))

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
      scoredById: 'user-1',
    })).rejects.toMatchObject({ code: 'PROVIDER_FAILURE' })

    expect(harness.db.transaction).toHaveBeenCalledTimes(1)
    expect(harness.txDeleteWhere).toHaveBeenCalledTimes(1)
    expect(harness.txUpdateWhere).toHaveBeenCalledTimes(1)
    expect(successfulRun).toMatchObject({
      status: 'completed',
      compositeScore: 80,
      rawResponse: scoring,
      scoredById: 'user-1',
    })
  })

  it('does not call the provider when missing-only analysis sees a score of zero', async () => {
    harness.applicationFindFirst.mockResolvedValue({ ...applicationRecord, score: 0 })

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
      onlyIfUnscored: true,
    })).resolves.toEqual({ skipped: true, reason: 'already_scored' })

    expect(harness.loadAiConfig).not.toHaveBeenCalled()
    expect(harness.scoreApplication).not.toHaveBeenCalled()
    expect(harness.db.transaction).not.toHaveBeenCalled()
  })

  it('passes the queue abort signal through to the provider call', async () => {
    const controller = new AbortController()

    await analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
      abortSignal: controller.signal,
    })

    expect(harness.scoreApplication).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { abortSignal: controller.signal },
    )
  })

  it('does not overwrite a score that wins after the provider precheck', async () => {
    harness.txApplicationForUpdate.mockResolvedValue([{ score: 55 }])

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
      onlyIfUnscored: true,
    })).resolves.toEqual({ skipped: true, reason: 'already_scored' })

    expect(harness.scoreApplication).toHaveBeenCalledTimes(1)
    expect(harness.txInsertValues).not.toHaveBeenCalled()
    expect(harness.txUpdateSet).not.toHaveBeenCalled()
  })

  it('can persist through a caller-owned transaction for atomic task fencing', async () => {
    const persistenceTransaction = vi.fn(async operation => operation(harness.tx))

    await expect(analyzeApplication({
      organizationId: 'org-1',
      applicationId: 'application-1',
      onlyIfUnscored: true,
      persistenceTransaction,
    })).resolves.toMatchObject({ analysisRunId: 'run-1' })

    expect(persistenceTransaction).toHaveBeenCalledTimes(1)
    expect(harness.db.transaction).not.toHaveBeenCalled()
  })
})
