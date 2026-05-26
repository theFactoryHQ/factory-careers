import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import postgres from 'postgres'
import { test, expect, selectFactorySelectOption } from '../fixtures'

type CapturedAiRequest = {
  schemaName: string
  system: string
  prompt: string
  provider: string
  model: string
}

type ApplicationLookup = {
  applicationId: string
  candidateId: string
  organizationId: string
}

async function readCapturedAiRequests(capturePath: string): Promise<CapturedAiRequest[]> {
  try {
    const contents = await readFile(capturePath, 'utf8')
    return contents
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapturedAiRequest)
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

async function lookupApplicationByEmail(email: string): Promise<ApplicationLookup> {
  expect(process.env.DATABASE_URL, 'DATABASE_URL is required for AI candidate review E2E').toBeTruthy()
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

  try {
    const [row] = await sql<ApplicationLookup[]>`
      select
        a.id as "applicationId",
        c.id as "candidateId",
        a.organization_id as "organizationId"
      from application a
      inner join candidate c on c.id = a.candidate_id
      where c.email = ${email}
      order by a.created_at desc
      limit 1
    `

    expect(row, `expected application for ${email}`).toBeTruthy()
    return row!
  }
  finally {
    await sql.end()
  }
}

async function seedParsedResume(params: {
  organizationId: string
  candidateId: string
  resumeText: string
}) {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
  const documentId = randomUUID()

  try {
    await sql`
      insert into document (
        id,
        organization_id,
        candidate_id,
        type,
        storage_key,
        original_filename,
        mime_type,
        size_bytes,
        parsed_content
      )
      values (
        ${documentId},
        ${params.organizationId},
        ${params.candidateId},
        'resume',
        ${`${params.organizationId}/${params.candidateId}/${documentId}.txt`},
        'deterministic-resume.txt',
        'text/plain',
        ${params.resumeText.length},
        ${sql.json({ text: params.resumeText })}
      )
    `
  }
  finally {
    await sql.end()
  }
}

async function seedCrossTenantSentinel(sentinel: string) {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
  const orgId = randomUUID()
  const candidateId = randomUUID()
  const jobId = randomUUID()
  const applicationId = randomUUID()
  const documentId = randomUUID()

  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into organization (id, name, slug)
        values (${orgId}, ${`Sentinel Org ${orgId.slice(0, 8)}`}, ${`sentinel-${orgId.slice(0, 8)}`})
      `
      await tx`
        insert into job (id, organization_id, title, slug, description, status, active_from)
        values (${jobId}, ${orgId}, 'Sentinel Role', ${`sentinel-role-${jobId.slice(0, 8)}`}, ${sentinel}, 'open', now())
      `
      await tx`
        insert into candidate (id, organization_id, first_name, last_name, email)
        values (${candidateId}, ${orgId}, 'Cross', 'Tenant', ${`cross-tenant-${candidateId}@example.com`})
      `
      await tx`
        insert into application (id, organization_id, candidate_id, job_id, cover_letter_text)
        values (${applicationId}, ${orgId}, ${candidateId}, ${jobId}, ${sentinel})
      `
      await tx`
        insert into document (
          id,
          organization_id,
          candidate_id,
          type,
          storage_key,
          original_filename,
          mime_type,
          size_bytes,
          parsed_content
        )
        values (
          ${documentId},
          ${orgId},
          ${candidateId},
          'resume',
          ${`${orgId}/${candidateId}/${documentId}.txt`},
          'sentinel-resume.txt',
          'text/plain',
          ${sentinel.length},
          ${tx.json({ text: sentinel })}
        )
      `
    })
  }
  finally {
    await sql.end()
  }
}

test.describe('AI candidate review', () => {
  test('scores a submitted candidate through the dashboard using deterministic local AI', async ({ authenticatedPage, browser }, testInfo) => {
    const capturePath = process.env.FACTORY_AI_CAPTURE_PATH
    expect(process.env.FACTORY_AI_TEST_MODE, 'AI E2E must use mock mode, not a real provider').toBe('mock')
    expect(capturePath, 'FACTORY_AI_CAPTURE_PATH must be set for AI E2E').toBeTruthy()
    await rm(capturePath!, { force: true })

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
      latestRun: { id: string, summary: string | null } | null
      scores: Array<{ criterionKey: string, score: number, evidence: string }>
    }
    expect(scores.compositeScore).toBe(90)
    expect(scores.latestRun).toMatchObject({
      id: analysis.analysisRunId,
      summary: 'Deterministic E2E review: strong Factory-domain alignment for this candidate.',
    })
    expect(scores.scores).toContainEqual(expect.objectContaining({
      criterionKey: 'domain_relevance',
      score: 9,
      evidence: expect.stringContaining('athletes, entertainers, founders, media, and investments'),
    }))

    await expect.poll(async () => (await readCapturedAiRequests(capturePath!)).length, {
      message: 'AI mock provider should capture the scoring request',
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(1)

    const captured = (await readCapturedAiRequests(capturePath!)).find(request => request.schemaName === 'CandidateScoring')
    expect(captured, 'candidate scoring request should be captured').toBeTruthy()
    expect(captured?.provider).toBe('openai')
    expect(captured?.model).toBe('factory-e2e-candidate-review')
    expect(captured?.prompt).toContain(applicant.resumeText)
    expect(captured?.prompt).toContain(jobTitle)
    expect(captured?.prompt).not.toContain(sentinel)
    expect(captured?.system).not.toContain(sentinel)
  })
})
