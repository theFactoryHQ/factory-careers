import { test, expect } from '../fixtures'

const JOB_TITLE = 'Interview Lifecycle Test Job'
const INTERVIEW_TITLE = 'Candidate screen'

test.describe('Interview scheduling lifecycle', () => {
  test('schedules an interview from the application UI and marks it complete from the dashboard', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`
    const jobTitle = `${JOB_TITLE} ${unique}`
    const applicant = {
      firstName: 'Interview',
      lastName: 'Candidate',
      email: `interview.candidate.${unique}@example.com`,
    }
    const applicantName = `${applicant.firstName} ${applicant.lastName}`

    const createJobResponse = await page.request.post('/api/jobs', {
      data: {
        title: jobTitle,
        description: 'A fast E2E job for interview scheduling.',
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
    await emailCheckbox.uncheck()

    const calendarCheckbox = page.getByRole('checkbox', { name: /Calendar|Microsoft|Google/i }).first()
    await expect(calendarCheckbox, 'calendar sync should be disabled when no provider is configured').not.toBeChecked()

    await page.getByLabel('Title').fill(`${INTERVIEW_TITLE} ${unique}`)
    await page.getByRole('button', { name: '30m' }).click()

    const [scheduleResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/interviews') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Schedule Interview' }).last().click(),
    ])
    expect(scheduleResponse.status(), `Schedule interview API returned ${scheduleResponse.status()}`).toBe(201)
    const createdInterview = await scheduleResponse.json() as { id: string; calendarEventProvider?: string | null; googleCalendarEventId?: string | null }
    expect(createdInterview.id, 'created interview id must be present').toBeTruthy()
    expect(createdInterview.calendarEventProvider ?? null).toBeNull()
    expect(createdInterview.googleCalendarEventId ?? null).toBeNull()
    await expect(page.getByRole('heading', { name: 'Interview Scheduled' })).toBeVisible({ timeout: 15_000 })

    await page.goto('/dashboard/interviews', { waitUntil: 'networkidle' })
    const interviewRow = page.locator('.ui-list-row').filter({ hasText: `${INTERVIEW_TITLE} ${unique}` })
    await expect(interviewRow).toBeVisible({ timeout: 15_000 })
    await expect(interviewRow).toContainText(applicantName)
    await expect(interviewRow).toContainText(jobTitle)
    await expect(interviewRow).toContainText('30min')
    await expect(interviewRow).toContainText('Scheduled')

    const [completeResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes(`/api/interviews/${createdInterview.id}`) && resp.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      interviewRow.getByRole('button', { name: 'Complete' }).click(),
    ])
    expect(completeResponse.status(), `Complete interview API returned ${completeResponse.status()}`).toBe(200)
    await expect(interviewRow.getByText('Completed', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(interviewRow.getByRole('button', { name: 'Complete' })).toHaveCount(0)

    await page.reload()
    const reloadedRow = page.locator('.ui-list-row').filter({ hasText: `${INTERVIEW_TITLE} ${unique}` })
    await expect(reloadedRow).toBeVisible({ timeout: 15_000 })
    await expect(reloadedRow.getByText('Completed', { exact: true })).toBeVisible()
  })
})
