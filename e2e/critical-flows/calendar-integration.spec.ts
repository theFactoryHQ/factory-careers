import { test, expect } from '../fixtures'

const JOB_TITLE = 'Calendar Integration Smoke Job'
const INTERVIEW_TITLE = 'Calendar sync screen'

test.describe('Calendar integration smoke', () => {
  test('connects a mocked provider, creates an interview event, and disconnects', async ({ authenticatedPage }, testInfo) => {
    expect(process.env.FACTORY_CALENDAR_TEST_MODE, 'calendar E2E must use deterministic mock mode').toBe('mock')

    const page = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`
    const jobTitle = `${JOB_TITLE} ${unique}`
    const applicant = {
      firstName: 'Calendar',
      lastName: 'Candidate',
      email: `calendar.candidate.${unique}@example.com`,
    }
    const applicantName = `${applicant.firstName} ${applicant.lastName}`

    await page.goto('/dashboard/settings/integrations', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Google Calendar' })).toBeVisible()

    await page.getByRole('button', { name: 'Connect shared calendar' }).click()
    await page.waitForURL(url => url.pathname === '/dashboard/settings/integrations', { timeout: 30_000 })
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('calendar.e2e@example.com')).toBeVisible()

    const connectedStatusResponse = await page.request.get('/api/calendar/status')
    expect(connectedStatusResponse.status(), `Connected calendar status API returned ${connectedStatusResponse.status()}`).toBe(200)
    const connectedStatus = await connectedStatusResponse.json() as { connected: boolean; provider: string | null; accountEmail: string | null }
    expect(connectedStatus).toMatchObject({
      connected: true,
      provider: 'google',
      accountEmail: 'calendar.e2e@example.com',
    })

    const createJobResponse = await page.request.post('/api/jobs', {
      data: {
        title: jobTitle,
        description: 'A fast E2E job for mocked calendar event sync.',
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

    const calendarCheckbox = page.getByRole('checkbox', { name: /Google Calendar/i })
    await expect(calendarCheckbox, 'calendar sync should default on after mocked provider connection').toBeChecked()
    await expect(calendarCheckbox).toBeEnabled()

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
    const createdInterview = await scheduleResponse.json() as {
      id: string
      calendarEventProvider?: string | null
      googleCalendarEventId?: string | null
      googleCalendarEventLink?: string | null
    }
    expect(createdInterview.calendarEventProvider).toBe('google')
    expect(createdInterview.googleCalendarEventId).toMatch(/^mock-google-event-/)
    expect(createdInterview.googleCalendarEventLink).toContain('https://calendar.test.local/events/mock-google-event-')
    await expect(page.getByRole('heading', { name: 'Interview Scheduled' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Calendar event created')).toBeVisible()
    await expect(page.getByRole('link', { name: /Open in Google Calendar/i })).toHaveAttribute(
      'href',
      createdInterview.googleCalendarEventLink!,
    )

    const interviewResponse = await page.request.get(`/api/interviews/${createdInterview.id}`)
    expect(interviewResponse.status(), `Interview detail API returned ${interviewResponse.status()}`).toBe(200)
    const interviewDetail = await interviewResponse.json() as {
      calendarEventProvider: string | null
      calendarEvents: Array<{ eventId: string | null; eventLink: string | null; syncStatus: string }>
    }
    expect(interviewDetail.calendarEventProvider).toBe('google')
    expect(interviewDetail.calendarEvents).toContainEqual(expect.objectContaining({
      eventId: createdInterview.googleCalendarEventId,
      eventLink: createdInterview.googleCalendarEventLink,
      syncStatus: 'synced',
    }))

    await page.goto('/dashboard/settings/integrations', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Disconnect' }).click()
    const [disconnectResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/calendar/disconnect') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Yes, disconnect' }).click(),
    ])
    expect(disconnectResponse.status(), `Disconnect API returned ${disconnectResponse.status()}`).toBe(200)
    await expect(page.getByRole('button', { name: 'Connect shared calendar' })).toBeVisible({ timeout: 15_000 })

    const disconnectedStatusResponse = await page.request.get('/api/calendar/status')
    expect(disconnectedStatusResponse.status(), `Disconnected calendar status API returned ${disconnectedStatusResponse.status()}`).toBe(200)
    const disconnectedStatus = await disconnectedStatusResponse.json() as { connected: boolean; provider: string | null }
    expect(disconnectedStatus.connected).toBe(false)
    expect(disconnectedStatus.provider).toBeNull()
  })
})
