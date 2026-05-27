import { readFile, rm } from 'node:fs/promises'
import { test, expect } from '../fixtures'
import { assertMutatingE2ESafety } from '../safety'

type CapturedChatbotRequest = {
  schemaName: string
  system: string
  messages: Array<{ role: 'user' | 'assistant', content: string }>
  provider: string
  model: string
  scopeLabel: string
  agentId: string | null
  attachmentCount: number
  toolNames: string[]
}

async function readCapturedChatbotRequests(capturePath: string): Promise<CapturedChatbotRequest[]> {
  try {
    const contents = await readFile(capturePath, 'utf8')
    return contents
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapturedChatbotRequest)
      .filter((request) => request.schemaName === 'ChatbotChat')
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

test.describe('Chatbot agents and conversations', () => {
  test('creates an agent, sends a mocked conversation turn, and persists it after reload', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const baseURL = String(testInfo.project.use.baseURL ?? '')
    const capturePath = process.env.FACTORY_AI_CAPTURE_PATH

    assertMutatingE2ESafety({
      env: {
        PLAYWRIGHT_BASE_URL: baseURL,
        DATABASE_URL: process.env.DATABASE_URL,
      },
    })
    expect(process.env.FACTORY_AI_TEST_MODE, 'Chatbot E2E must use mock mode, not a real provider').toBe('mock')
    expect(capturePath, 'FACTORY_AI_CAPTURE_PATH must be set for chatbot E2E').toBeTruthy()
    await rm(capturePath!, { force: true })

    const runId = `${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}`
    const modelName = 'factory-e2e-chatbot-response'
    const agentName = `E2E Chatbot Agent ${runId}`
    const agentPrompt = `Answer as the deterministic E2E chatbot agent for ${runId}.`
    const userPrompt = `Summarize hiring slate ${runId}`

    const configResponse = await page.request.post('/api/ai-config', {
      data: {
        name: `Chatbot deterministic AI ${runId}`,
        provider: 'openai',
        model: modelName,
        apiKey: 'fake-local-only-key',
        maxTokens: 2048,
      },
    })
    expect(configResponse.status(), `Create AI config returned ${configResponse.status()}`).toBe(201)

    await page.goto('/dashboard/chatbot', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Factory Careers Assistant' })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Manage agents' }).click()
    await expect(page.getByRole('heading', { name: 'Manage agents' })).toBeVisible()
    await page.getByPlaceholder('e.g. Recruiter coach').fill(agentName)
    await page.getByPlaceholder('e.g. Reviews resumes against a job').fill('Deterministic chatbot e2e agent')
    await page.getByPlaceholder('Describe how this agent should behave').fill(agentPrompt)
    await page.getByLabel('Use this agent by default for new conversations').check()

    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/chatbot/agents') && resp.request().method() === 'POST' && resp.status() === 200),
      page.getByRole('button', { name: 'Create agent' }).click(),
    ])
    await expect(page.getByText(agentName)).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('heading', { name: 'Manage agents' })).toBeHidden()

    await page.getByRole('button', { name: /Default assistant/ }).click()
    await page.getByRole('button', { name: agentName }).click()
    await expect(page.getByRole('button', { name: new RegExp(agentName) })).toBeVisible()

    const [conversationResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/chatbot/conversations') && resp.request().method() === 'POST' && resp.status() === 200),
      page.getByRole('button', { name: 'New chat' }).click(),
    ])
    const conversationPayload = await conversationResponse.json() as { conversation: { id: string } }
    await expect(page).toHaveURL(new RegExp(`/dashboard/chatbot/${conversationPayload.conversation.id}$`))

    await page.getByPlaceholder('Ask Factory Careers Assistant anything…').fill(userPrompt)
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/chatbot/chat') && resp.request().method() === 'POST' && resp.status() === 200),
      page.getByRole('button', { name: 'Send' }).click(),
    ])

    const deterministicResponse = 'Deterministic E2E chatbot response for entire organization.'
    await expect(page.getByText(userPrompt, { exact: true }).last()).toBeVisible()
    await expect(page.getByText(deterministicResponse).last()).toBeVisible({ timeout: 15_000 })

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByText(userPrompt, { exact: true }).last()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(deterministicResponse).last()).toBeVisible()

    await page.goto('/dashboard/chatbot', { waitUntil: 'networkidle' })
    await expect(page.getByText(userPrompt, { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    await page.getByText(userPrompt, { exact: true }).first().click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/chatbot/${conversationPayload.conversation.id}$`))
    await expect(page.getByText(deterministicResponse).last()).toBeVisible()

    const missingConversationResponse = await page.request.post('/api/chatbot/chat', {
      data: {
        conversationId: 'missing-conversation',
        scope: { kind: 'organization' },
        messages: [{ role: 'user', content: 'Hello' }],
      },
    })
    expect(missingConversationResponse.status(), `Missing conversation returned ${missingConversationResponse.status()}`).toBe(404)

    await expect.poll(async () => (await readCapturedChatbotRequests(capturePath!)).length, {
      message: 'chatbot mock stream should capture the prompt context',
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(1)

    const captured = await readCapturedChatbotRequests(capturePath!)
    const chatRequest = captured.find(request => request.model === modelName)
    expect(chatRequest, 'chatbot request should be captured').toBeTruthy()
    expect(chatRequest?.provider).toBe('openai')
    expect(chatRequest?.system).toContain(agentPrompt)
    expect(chatRequest?.scopeLabel).toBe('entire organization')
    expect(chatRequest?.agentId).toBeTruthy()
    expect(chatRequest?.attachmentCount).toBe(0)
    expect(chatRequest?.toolNames).toContain('list_jobs')
    expect(chatRequest?.messages).toContainEqual(expect.objectContaining({
      role: 'user',
      content: userPrompt,
    }))
  })
})
