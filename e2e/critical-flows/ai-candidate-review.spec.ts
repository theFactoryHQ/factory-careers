import { test, expect, selectFactorySelectOption } from '../fixtures'
import { readJsonlCapture, setupCaptureFile } from '../helpers/captured-jsonl'
import {
  lookupApplicationByEmail,
  seedCrossTenantSentinel,
  seedParsedResume,
} from '../helpers/db'

type CapturedAiRequest = {
  schemaName: string
  system: string
  prompt: string
  provider: string
  model: string
}

test.describe('AI candidate review', () => {
  test('scores a submitted candidate through the dashboard using deterministic local AI', async ({ authenticatedPage, browser }, testInfo) => {
    expect(process.env.FACTORY_AI_TEST_MODE, 'AI E2E must use mock mode, not a real provider').toBe('mock')
    const capturePath = await setupCaptureFile('FACTORY_AI_CAPTURE_PATH', 'AI E2E')

    const page = authenticatedPage
    const runId = `${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}`
    const sentinel = `CROSS_TENANT_SENTINEL_${runId}`
    const jobTitle = `AI Review Principal Advisor ${runId}`
    const applicant = {
      firstName: 'Avery',
      lastName: 'Advisor',
      email: `avery.advisor.${runId}@example.com`,
      resumeText: `Avery advised professional athletes, entertainment founders, and family-office clients on media ventures, private investments, and brand partnerships. ${runId}`,
    }

    await seedCrossTenantSentinel(sentinel)

    const aiConfigResponse = await page.request.post('/api/ai-config', {
      data: {
        name: 'Local deterministic AI',
        provider: 'openai',
        model: 'factory-e2e-candidate-review',
        apiKey: 'fake-local-only-key',
        maxTokens: 2048,
        isDefaultAnalysis: true,
      },
    })
    expect(aiConfigResponse.status(), `AI config API returned ${aiConfigResponse.status()}`).toBe(201)

    const createJobResponse = await page.request.post('/api/jobs', {
      data: {
        title: jobTitle,
        description: 'Advise athletes, entertainers, and founders on private investments, media ventures, business management, and brand services.',
        location: 'New York, NY',
        type: 'full_time',
        requireResume: false,
        requireCoverLetter: false,
        autoScoreOnApply: false,
        applicationComplianceEnabled: false,
      },
    })
    expect(createJobResponse.status(), `Create job API returned ${createJobResponse.status()}`).toBe(201)
    const job = await createJobResponse.json() as { id: string, slug: string }

    const criteriaResponse = await page.request.post(`/api/jobs/${job.id}/criteria`, {
      data: {
        criteria: [{
          key: 'domain_relevance',
          name: 'Factory Domain Relevance',
          description: 'Relevant experience with athletes, entertainers, founders, investments, media, and business management.',
          category: 'experience',
          maxScore: 10,
          weight: 100,
          displayOrder: 0,
        }],
      },
    })
    expect(criteriaResponse.status(), `Criteria API returned ${criteriaResponse.status()}`).toBe(201)

    const publishResponse = await page.request.patch(`/api/jobs/${job.id}`, {
      data: { status: 'open' },
    })
    expect(publishResponse.status(), `Publish API returned ${publishResponse.status()}`).toBe(200)

    const candidateContext = await browser.newContext()
    const candidatePage = await candidateContext.newPage()
    await candidatePage.goto(`/jobs/${job.slug}/apply`)
    await candidatePage.waitForLoadState('networkidle')
    await expect(candidatePage.getByRole('heading', { name: jobTitle })).toBeVisible({ timeout: 15_000 })
    await candidatePage.getByLabel('First name').fill(applicant.firstName)
    await candidatePage.getByLabel('Last name').fill(applicant.lastName)
    await candidatePage.getByLabel('Email').fill(applicant.email)
    await selectFactorySelectOption(candidatePage, /Country/, 'United States')
    await selectFactorySelectOption(candidatePage, /State/, 'New York')

    const [applyResponse] = await Promise.all([
      candidatePage.waitForResponse(
        resp => resp.url().includes(`/api/public/jobs/${job.slug}/apply`) && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      candidatePage.getByRole('button', { name: /submit/i }).click(),
    ])
    expect(applyResponse.status(), `Apply API returned ${applyResponse.status()}`).toBe(201)
    await candidatePage.waitForURL(`**/jobs/${job.slug}/confirmation`, { waitUntil: 'commit', timeout: 15_000 })
    await candidateContext.close()

    const application = await lookupApplicationByEmail(applicant.email)
    await seedParsedResume({
      organizationId: application.organizationId,
      candidateId: application.candidateId,
      resumeText: applicant.resumeText,
    })

    await page.goto(`/dashboard/applications/${application.applicationId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: `${applicant.firstName} ${applicant.lastName}` })).toBeVisible({ timeout: 15_000 })

    const [analysisResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes(`/api/applications/${application.applicationId}/analyze`) && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Run Analysis' }).click(),
    ])
    expect(analysisResponse.status(), `Analysis API returned ${analysisResponse.status()}`).toBe(200)
    const analysis = await analysisResponse.json() as { compositeScore: number, summary: string, analysisRunId: string }
    expect(analysis).toMatchObject({
      compositeScore: 90,
      summary: 'Deterministic E2E review: strong Factory-domain alignment for this candidate.',
    })
    expect(analysis.analysisRunId).toBeTruthy()

    await expect(page.getByText('90')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Deterministic E2E review: strong Factory-domain alignment for this candidate.')).toBeVisible({ timeout: 15_000 })

    const scoresResponse = await page.request.get(`/api/applications/${application.applicationId}/scores`)
    expect(scoresResponse.status(), `Scores API returned ${scoresResponse.status()}`).toBe(200)
    const scores = await scoresResponse.json() as {
      compositeScore: number
      latestSuccessfulRun: { id: string, summary: string | null } | null
      scores: Array<{ criterionKey: string, score: number, evidence: string }>
    }
    expect(scores.compositeScore).toBe(90)
    expect(scores.latestSuccessfulRun).toMatchObject({
      id: analysis.analysisRunId,
      summary: 'Deterministic E2E review: strong Factory-domain alignment for this candidate.',
    })
    expect(scores.scores).toContainEqual(expect.objectContaining({
      criterionKey: 'domain_relevance',
      score: 9,
      evidence: expect.stringContaining('athletes, entertainers, founders, media, and investments'),
    }))

    await expect.poll(async () => (await readJsonlCapture<CapturedAiRequest>(capturePath)).length, {
      message: 'AI mock provider should capture the scoring request',
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(1)

    const captured = (await readJsonlCapture<CapturedAiRequest>(capturePath))
      .find(request => request.schemaName === 'CandidateScoring')
    expect(captured, 'candidate scoring request should be captured').toBeTruthy()
    expect(captured?.provider).toBe('openai')
    expect(captured?.model).toBe('factory-e2e-candidate-review')
    expect(captured?.prompt).toContain(applicant.resumeText)
    expect(captured?.prompt).toContain(jobTitle)
    expect(captured?.prompt).not.toContain(sentinel)
    expect(captured?.system).not.toContain(sentinel)
  })
})
