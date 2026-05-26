import { readFile, rm } from 'node:fs/promises'
import { test, expect } from '../fixtures'
import postgres from 'postgres'

type CapturedEmail = {
  to: string[]
  subject: string
  html: string
  text: string
  renderError?: string
}

type PrivacyRequestRecord = {
  id: string
  status: string
  requesterName: string
  requesterEmail: string
  stateOfResidence: string
  details: string | null
  verificationTokenHash: string
  verifiedAt: Date | null
}

async function readCapturedEmails(capturePath: string): Promise<CapturedEmail[]> {
  try {
    const contents = await readFile(capturePath, 'utf8')
    return contents
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapturedEmail)
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

async function lookupPrivacyRequest(requesterEmail: string) {
  expect(process.env.DATABASE_URL, 'DATABASE_URL is required for privacy request e2e coverage').toBeTruthy()
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

  try {
    const [request] = await sql<PrivacyRequestRecord[]>`
      select
        id,
        status,
        requester_name as "requesterName",
        requester_email as "requesterEmail",
        state_of_residence as "stateOfResidence",
        details,
        verification_token_hash as "verificationTokenHash",
        verified_at as "verifiedAt"
      from privacy_request
      where requester_email = ${requesterEmail}
      order by created_at desc
      limit 1
    `

    return request ?? null
  }
  finally {
    await sql.end()
  }
}

function extractVerifyUrl(email: CapturedEmail) {
  const content = `${email.text}\n${email.html}`
  return content.match(/http:\/\/127\.0\.0\.1:3333\/api\/privacy-requests\/verify\?token=[^\s"'<>]+/)?.[0] ?? ''
}

test.describe('Privacy request fake mail', () => {
  test('verifies deletion request persistence, fake-mail verification, and confirmation', async ({ page }, testInfo) => {
    const capturePath = process.env.FACTORY_EMAIL_CAPTURE_PATH
    expect(capturePath, 'FACTORY_EMAIL_CAPTURE_PATH must be set for privacy request E2E').toBeTruthy()
    expect(process.env.FACTORY_EMAIL_TEST_MODE, 'E2E mail must use capture mode, not a real provider').toBe('capture')

    await rm(capturePath!, { force: true })

    const id = `${Date.now()}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2)}`
    const requester = {
      name: `Privacy Requester ${id}`,
      email: `privacy.requester.${id}@example.com`,
      state: 'California',
      context: `Candidate role context ${id}`,
      details: `Please review deletion for application fixture ${id}.`,
    }
    const privacyInbox = process.env.FACTORY_CAREERS_PRIVACY_INBOX || 'legal@thefactoryhq.com'

    await page.goto('/privacy/delete-request')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Request deletion of applicant information' })).toBeVisible()
    await page.getByLabel('Name').fill(requester.name)
    await page.getByLabel('Email').fill(requester.email)
    await page.getByLabel('State of residence').selectOption(requester.state)
    await page.getByLabel('Role or application context').fill(requester.context)
    await page.getByLabel('Details').fill(requester.details)

    const [submitResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/privacy-requests') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Submit deletion request' }).click(),
    ])
    expect(submitResponse.status()).toBe(202)
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

    await expect.poll(async () => (await readCapturedEmails(capturePath!)).length, {
      message: 'privacy request should capture requester verification and internal alert emails',
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(2)

    const request = await lookupPrivacyRequest(requester.email)
    expect(request, 'privacy request should be persisted').toBeTruthy()
    expect(request).toMatchObject({
      status: 'submitted',
      requesterName: requester.name,
      requesterEmail: requester.email,
      stateOfResidence: requester.state,
      verifiedAt: null,
    })
    expect(request?.details).toContain(requester.context)
    expect(request?.details).toContain(requester.details)
    expect(request?.verificationTokenHash).toMatch(/^[a-f0-9]{64}$/)

    const capturedEmails = await readCapturedEmails(capturePath!)
    const verificationEmail = capturedEmails.find((email) => email.subject === 'Verify your deletion request — Factory Careers')
    expect(verificationEmail, 'requester verification email should be captured').toBeTruthy()
    expect(verificationEmail?.renderError, 'requester verification email should render successfully').toBeUndefined()
    expect(verificationEmail?.to).toContain(requester.email)
    expect(verificationEmail?.text).toContain(requester.name)
    expect(verificationEmail?.text).toContain('Verify your deletion request')

    const verifyUrl = extractVerifyUrl(verificationEmail!)
    expect(verifyUrl, 'verification email should contain a local verification URL').toContain('/api/privacy-requests/verify?token=')
    expect(verifyUrl).not.toContain(request.verificationTokenHash)
    expect(verifyUrl).not.toContain('thefactoryhq.com')

    const internalAlert = capturedEmails.find((email) => email.subject === `Privacy deletion request: ${requester.email}`)
    expect(internalAlert, 'privacy-team alert email should be captured').toBeTruthy()
    expect(internalAlert?.renderError, 'privacy-team alert email should render successfully').toBeUndefined()
    expect(internalAlert?.to).toContain(privacyInbox)
    expect(internalAlert?.text).toContain(requester.name)
    expect(internalAlert?.text).toContain(requester.email)
    expect(internalAlert?.text).toContain(requester.state)

    const verifyResponse = await page.request.get(verifyUrl)
    expect(verifyResponse.status()).toBe(200)
    await expect.poll(async () => (await lookupPrivacyRequest(requester.email))?.status, {
      message: 'privacy request should move to verified after opening the verification URL',
      timeout: 10_000,
    }).toBe('verified')

    const verifiedRequest = await lookupPrivacyRequest(requester.email)
    expect(verifiedRequest?.verifiedAt).toBeTruthy()

    await expect.poll(async () => (await readCapturedEmails(capturePath!)).length, {
      message: 'privacy verification should capture confirmation email',
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(3)

    const confirmationEmail = (await readCapturedEmails(capturePath!))
      .find((email) => email.subject === 'Deletion request verified — Factory Careers')
    expect(confirmationEmail, 'requester confirmation email should be captured').toBeTruthy()
    expect(confirmationEmail?.renderError, 'requester confirmation email should render successfully').toBeUndefined()
    expect(confirmationEmail?.to).toContain(requester.email)
    expect(confirmationEmail?.text).toContain('Request verified')
  })
})
