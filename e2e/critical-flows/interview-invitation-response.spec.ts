import { readFile, rm } from 'node:fs/promises'
import { test, expect } from '../fixtures'

const JOB_TITLE = 'Interview Invitation Response Test Job'
const INTERVIEW_TITLE = 'Candidate response screen'

type CapturedEmail = {
  to: string[]
  subject: string
  html: string
  text: string
  renderError?: string
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

function extractAcceptUrl(email: CapturedEmail) {
  const content = `${email.text}\n${email.html}`
  return content.match(/http:\/\/127\.0\.0\.1:3333\/interview\/respond\?token=[A-Za-z0-9._%-]+/)?.[0] ?? ''
}

test.describe('Interview invitation response', () => {
  test('captures the invitation email and records the candidate response', async ({ authenticatedPage, browser }, testInfo) => {
    const capturePath = process.env.FACTORY_EMAIL_CAPTURE_PATH
    expect(capturePath, 'FACTORY_EMAIL_CAPTURE_PATH must be set for interview invitation E2E').toBeTruthy()
    expect(process.env.FACTORY_EMAIL_TEST_MODE, 'Interview invitation E2E must use capture mode').toBe('capture')

    await rm(capturePath!, { force: true })

    const page = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`
    const jobTitle = `${JOB_TITLE} ${unique}`
    const applicant = {
      firstName: 'Response',
      lastName: 'Candidate',
      email: `interview.response.${unique}@example.com`,
    }
    const applicantName = `${applicant.firstName} ${applicant.lastName}`

    const createJobResponse = await page.request.post('/api/jobs', {
      data: {
        title: jobTitle,
        description: 'A fast E2E job for interview invitation responses.',
        location: 'Remote',
        requireResume: false,
        requireCoverLetter: false,
        applicationComplianceEnabled: false,
        autoScoreOnApply: false,
      },
    })
    expect(createJobResponse.status(), `Create job API returned ${createJobResponse.status()}`).toBe(201)
    const createdJob = await createJobResponse.json() as { id: string; slug: string }

    const publishJobResponse = await page.request.patch(`/api/jobs/${createdJob.id}`, {
      data: { status: 'open' },
    })
    expect(publishJobResponse.status(), `Publish job API returned ${publishJobResponse.status()}`).toBe(200)
    const publishedJob = await publishJobResponse.json() as { slug: string }

    const applyResponse = await page.request.post(`/api/public/jobs/${publishedJob.slug}/apply`, {
      data: {
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        email: applicant.email,
        country: 'United States',
        state: 'CA',
        responses: [],
      },
    })
    expect(applyResponse.status(), `Apply API returned ${applyResponse.status()}`).toBe(201)

    const applicationsResponse = await page.request.get(`/api/applications?jobId=${createdJob.id}&limit=10`)
    expect(applicationsResponse.status(), `Applications API returned ${applicationsResponse.status()}`).toBe(200)
    const applications = await applicationsResponse.json() as {
      data: Array<{ id: string; candidateEmail: string }>
    }
    const application = applications.data.find(item => item.candidateEmail === applicant.email)
    expect(application?.id, 'application id must be discoverable after public apply').toBeTruthy()

    await page.goto(`/dashboard/applications/${application!.id}`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: new RegExp(applicantName) })).toBeVisible({ timeout: 15_000 })
    const quickActions = page.locator('.ui-panel').filter({ hasText: 'Quick actions' })
    await quickActions.getByRole('button', { name: 'Schedule Interview' }).click()
    await expect(page.getByRole('heading', { name: 'Schedule Interview' })).toBeVisible({ timeout: 15_000 })

    const emailCheckbox = page.getByRole('checkbox', { name: /Standard email/i })
    await expect(emailCheckbox).toBeChecked()
    const calendarCheckbox = page.getByRole('checkbox', { name: /Calendar|Microsoft|Google/i }).first()
    await expect(calendarCheckbox, 'calendar sync should be disabled when no provider is configured').not.toBeChecked()

    await page.getByLabel('Title').fill(`${INTERVIEW_TITLE} ${unique}`)
    await page.getByRole('button', { name: '30m' }).click()

    const [scheduleResponse, invitationResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/interviews') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.waitForResponse(
        resp => resp.url().includes('/send-invitation') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Schedule Interview' }).last().click(),
    ])
    expect(scheduleResponse.status(), `Schedule interview API returned ${scheduleResponse.status()}`).toBe(201)
    expect(invitationResponse.status(), `Send invitation API returned ${invitationResponse.status()}`).toBe(200)
    const createdInterview = await scheduleResponse.json() as { id: string; calendarEventProvider?: string | null; googleCalendarEventId?: string | null }
    expect(createdInterview.id, 'created interview id must be present').toBeTruthy()
    expect(createdInterview.calendarEventProvider ?? null).toBeNull()
    expect(createdInterview.googleCalendarEventId ?? null).toBeNull()

    await expect.poll(async () => (await readCapturedEmails(capturePath!)).length, {
      message: 'interview scheduling should capture the candidate invitation email',
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(1)

    const invitation = (await readCapturedEmails(capturePath!))
      .find(email =>
        email.subject.startsWith(`Interview Invitation: ${jobTitle} at `)
        && email.to.includes(applicant.email),
      )
    expect(invitation, 'candidate interview invitation email should be captured').toBeTruthy()
    expect(invitation?.renderError, 'candidate interview invitation email should render successfully').toBeUndefined()
    expect(invitation?.to).toContain(applicant.email)
    expect(invitation?.text).toContain(applicantName)
    expect(invitation?.text).toContain(jobTitle)

    const acceptUrl = extractAcceptUrl(invitation!)
    expect(acceptUrl, 'invitation email should contain a local accept URL').toContain('/interview/respond?token=')
    expect(acceptUrl).not.toContain('thefactoryhq.com')

    const candidateContext = await browser.newContext()
    const candidatePage = await candidateContext.newPage()
    await candidatePage.goto(acceptUrl, { waitUntil: 'networkidle' })
    await expect(candidatePage.getByRole('heading', { name: 'Interview Invitation' })).toBeVisible({ timeout: 15_000 })
    await expect(candidatePage.getByText(`${INTERVIEW_TITLE} ${unique}`)).toBeVisible()
    await expect(candidatePage.getByText(jobTitle)).toBeVisible()

    const [candidateResponse] = await Promise.all([
      candidatePage.waitForResponse(
        resp => resp.url().includes('/api/public/interviews/respond') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      candidatePage.getByRole('button', { name: 'Accept Interview' }).click(),
    ])
    expect(candidateResponse.status(), `Candidate response API returned ${candidateResponse.status()}`).toBe(200)
    await expect(candidatePage.getByRole('heading', { name: 'Response Recorded' })).toBeVisible({ timeout: 15_000 })
    await candidateContext.close()

    const interviewResponse = await page.request.get(`/api/interviews/${createdInterview.id}`)
    expect(interviewResponse.status(), `Interview detail API returned ${interviewResponse.status()}`).toBe(200)
    const updatedInterview = await interviewResponse.json() as { candidateResponse: string; candidateRespondedAt: string | null }
    expect(updatedInterview.candidateResponse).toBe('accepted')
    expect(updatedInterview.candidateRespondedAt).toBeTruthy()

    await page.goto(`/dashboard/interviews/${createdInterview.id}`, { waitUntil: 'networkidle' })
    await expect(page.getByText('Candidate response', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Accepted', { exact: true })).toBeVisible()
  })
})
