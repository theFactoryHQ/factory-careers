import { readFile, rm } from 'node:fs/promises'
import { test, expect } from '../fixtures'

type CapturedAiRequest = {
  schemaName: string
  system: string
  prompt: string
  provider: string
  model: string
}

type AiConfigRow = {
  id: string
  name: string
  model: string
  isDefaultChatbot: boolean
  isDefaultAnalysis: boolean
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

test.describe('AI configuration lifecycle', () => {
  test('creates, edits, tests, defaults, and uses local AI config for generated job criteria', async ({ authenticatedPage }, testInfo) => {
    const capturePath = process.env.FACTORY_AI_CAPTURE_PATH
    expect(process.env.FACTORY_AI_TEST_MODE, 'AI E2E must use mock mode, not a real provider').toBe('mock')
    expect(capturePath, 'FACTORY_AI_CAPTURE_PATH must be set for AI E2E').toBeTruthy()
    await rm(capturePath!, { force: true })

    const page = authenticatedPage
    const runId = `${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}`
    const firstConfigName = `Local deterministic AI ${runId}`
    const editedConfigName = `Edited deterministic AI ${runId}`
    const analysisConfigName = `Criteria deterministic AI ${runId}`
    const brokenConfigName = `Broken deterministic AI ${runId}`
    const jobTitle = `AI Criteria Client Lead ${runId}`

    await page.goto('/dashboard/settings/ai')
    await expect(page.getByRole('heading', { name: 'AI Configuration' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('link', { name: 'Add your first model' }).click()

    await expect(page.getByRole('heading', { name: 'Add an AI model' })).toBeVisible({ timeout: 15_000 })
    await page.getByPlaceholder('e.g. GPT-4o (production)').fill(firstConfigName)
    await page.getByPlaceholder('sk-…').fill('fake-local-only-key')
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/ai-config') && resp.request().method() === 'POST' && resp.status() === 201),
      page.getByRole('button', { name: 'Add model' }).click(),
    ])
    await expect(page.getByRole('heading', { name: 'AI Configuration' })).toBeVisible({ timeout: 15_000 })
    const firstRow = page.locator('li').filter({ hasText: firstConfigName })
    await expect(firstRow.getByRole('heading', { name: firstConfigName })).toBeVisible()
    await expect(firstRow.getByText('Chatbot default')).toBeVisible()
    await expect(firstRow.getByText('Analysis default')).toBeVisible()

    await firstRow.getByRole('link', { name: 'Edit' }).click()
    await expect(page.getByRole('heading', { name: new RegExp(firstConfigName) })).toBeVisible({ timeout: 15_000 })
    await page.getByPlaceholder('e.g. GPT-4o (production)').fill(editedConfigName)
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/ai-config/') && resp.request().method() === 'PATCH' && resp.status() === 200),
      page.getByRole('button', { name: 'Save changes' }).click(),
    ])
    await expect(page.getByText(editedConfigName)).toBeVisible({ timeout: 15_000 })

    const editedRow = page.locator('li').filter({ hasText: editedConfigName })
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/test-connection') && resp.request().method() === 'POST' && resp.status() === 200),
      editedRow.getByRole('button', { name: 'Test' }).click(),
    ])
    await expect(editedRow.getByText('Connection verified.')).toBeVisible()

    const analysisConfigResponse = await page.request.post('/api/ai-config', {
      data: {
        name: analysisConfigName,
        provider: 'openai',
        model: 'factory-e2e-generated-criteria',
        apiKey: 'fake-local-only-key',
        maxTokens: 2048,
      },
    })
    expect(analysisConfigResponse.status(), `Analysis config API returned ${analysisConfigResponse.status()}`).toBe(201)

    const brokenConfigResponse = await page.request.post('/api/ai-config', {
      data: {
        name: brokenConfigName,
        provider: 'openai',
        model: 'factory-e2e-connection-failure',
        apiKey: 'fake-local-only-key',
        maxTokens: 256,
      },
    })
    expect(brokenConfigResponse.status(), `Broken config API returned ${brokenConfigResponse.status()}`).toBe(201)

    await page.reload()
    const analysisRow = page.locator('li').filter({ hasText: analysisConfigName })
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/set-default') && resp.request().method() === 'POST' && resp.status() === 200),
      analysisRow.getByRole('button', { name: 'Use for analysis' }).click(),
    ])
    await expect(analysisRow.getByText('Analysis default')).toBeVisible({ timeout: 15_000 })

    const configsResponse = await page.request.get('/api/ai-config')
    expect(configsResponse.status(), `AI config list API returned ${configsResponse.status()}`).toBe(200)
    const configs = await configsResponse.json() as AiConfigRow[]
    const defaultAnalysis = configs.find(config => config.isDefaultAnalysis)
    expect(defaultAnalysis).toMatchObject({
      name: analysisConfigName,
      model: 'factory-e2e-generated-criteria',
    })

    const brokenRow = page.locator('li').filter({ hasText: brokenConfigName })
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/test-connection') && resp.request().method() === 'POST' && resp.status() === 422),
      brokenRow.getByRole('button', { name: 'Test' }).click(),
    ])
    await expect(brokenRow.getByText('Deterministic E2E connection failure.')).toBeVisible()

    const createJobResponse = await page.request.post('/api/jobs', {
      data: {
        title: jobTitle,
        description: 'Lead client operations for athletes, entertainers, and founders across investments, media ventures, brand services, confidentiality, and high-touch business management.',
        location: 'New York, NY',
        type: 'full_time',
        requireResume: false,
        requireCoverLetter: false,
        autoScoreOnApply: false,
        applicationComplianceEnabled: false,
      },
    })
    expect(createJobResponse.status(), `Create job API returned ${createJobResponse.status()}`).toBe(201)
    const job = await createJobResponse.json() as { id: string }

    await page.goto(`/dashboard/jobs/${job.id}/ai-analysis`)
    await expect(page.getByRole('heading', { name: 'AI' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /Generate from job description/ })).toBeVisible()

    const generatedCriteriaResponse = await page.request.post('/api/ai-config/generate-criteria', {
      data: {
        title: jobTitle,
        description: 'Lead client operations for athletes, entertainers, and founders across investments, media ventures, brand services, confidentiality, and high-touch business management.',
      },
    })
    expect(generatedCriteriaResponse.status(), `Generate criteria API returned ${generatedCriteriaResponse.status()}`).toBe(200)
    const generatedCriteria = await generatedCriteriaResponse.json() as {
      criteria: Array<{ key: string, name: string, description?: string, category: string, maxScore: number, weight: number }>
    }
    expect(generatedCriteria.criteria).toContainEqual(expect.objectContaining({
      key: 'domain_relevance',
      name: 'Factory Domain Relevance',
    }))

    const saveCriteriaResponse = await page.request.post(`/api/jobs/${job.id}/criteria`, {
      data: {
        criteria: generatedCriteria.criteria.map((criterion, index) => ({
          ...criterion,
          displayOrder: index,
        })),
      },
    })
    expect(saveCriteriaResponse.status(), `Save criteria API returned ${saveCriteriaResponse.status()}`).toBe(201)

    await page.reload()
    await expect(page.getByText('Factory Domain Relevance')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Client Operations Judgment')).toBeVisible()

    const criteriaResponse = await page.request.get(`/api/jobs/${job.id}/criteria`)
    expect(criteriaResponse.status(), `Criteria API returned ${criteriaResponse.status()}`).toBe(200)
    const criteriaPayload = await criteriaResponse.json() as { criteria: Array<{ key: string, name: string, organizationId: string, jobId: string }> }
    expect(criteriaPayload.criteria).toContainEqual(expect.objectContaining({
      key: 'domain_relevance',
      name: 'Factory Domain Relevance',
      jobId: job.id,
    }))

    await expect.poll(async () => (await readCapturedAiRequests(capturePath!)).length, {
      message: 'AI mock provider should capture connection checks and generated criteria',
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(3)

    const captured = await readCapturedAiRequests(capturePath!)
    const generatedCriteriaRequest = captured.find(request => request.schemaName === 'GeneratedCriteria')
    expect(generatedCriteriaRequest, 'generated criteria request should be captured').toBeTruthy()
    expect(generatedCriteriaRequest?.provider).toBe('openai')
    expect(generatedCriteriaRequest?.model).toBe('factory-e2e-generated-criteria')
    expect(generatedCriteriaRequest?.prompt).toContain(jobTitle)
    expect(generatedCriteriaRequest?.prompt).toContain('athletes, entertainers, and founders')
  })
})
