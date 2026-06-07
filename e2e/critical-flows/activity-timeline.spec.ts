import type { APIRequestContext, APIResponse, Browser, Page } from '@playwright/test'
import { assertMutatingE2ESafety } from '../safety'
import { expect, test } from '../fixtures'
import {
  createApplication,
  createCandidate,
  createJob,
  updateApplicationStatus,
  type ApplicationRecord,
  type CandidateRecord,
  type JobRecord,
} from '../helpers/recruiting-fixtures'

type InterviewRecord = {
  id: string
}

type ActivityItem = {
  id: string
  action: string
  resourceType: string
  resourceId: string
  metadata: Record<string, unknown> | null
  createdAt: string
  actorName?: string | null
  resourceName?: string | null
  candidateName?: string | null
  jobName?: string | null
}

type TimelineResponse = {
  items: ActivityItem[]
  upcoming: ActivityItem[]
}

async function expectStatus(response: APIResponse, expected: number, label: string) {
  expect(response.status(), `${label} returned ${response.status()}: ${await response.text()}`).toBe(expected)
}

async function createTimelineCandidate(request: Parameters<typeof createCandidate>[0], unique: string): Promise<CandidateRecord> {
  return createCandidate(request, {
    firstName: 'Timeline',
    lastName: `Audit ${unique}`,
    email: `timeline.audit.${unique}@example.com`,
  })
}

async function createApplicationComment(request: APIRequestContext, applicationId: string, unique: string) {
  const response = await request.post('/api/comments', {
    data: {
      targetType: 'application',
      targetId: applicationId,
      body: `Activity timeline audit comment ${unique}`,
    },
  })
  await expectStatus(response, 201, 'Create comment API')
  return await response.json() as { id: string }
}

async function createInterview(request: APIRequestContext, applicationId: string, unique: string): Promise<InterviewRecord> {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const response = await request.post('/api/interviews', {
    data: {
      applicationId,
      title: `Activity timeline interview ${unique}`,
      type: 'phone',
      scheduledAt: tomorrow.toISOString(),
      duration: 30,
      timezone: 'UTC',
      location: 'Video call',
      calendarSync: false,
    },
  })
  await expectStatus(response, 201, 'Create interview API')
  const interview = await response.json() as InterviewRecord & {
    calendarEventProvider?: string | null
    googleCalendarEventId?: string | null
  }
  expect(interview.calendarEventProvider ?? null, 'activity timeline e2e must not sync a real calendar provider').toBeNull()
  expect(interview.googleCalendarEventId ?? null, 'activity timeline e2e must not create a calendar event').toBeNull()
  return interview
}

async function signUpWithOrganization(browser: Browser, baseURL: string, label: string) {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const account = {
    name: `Timeline Isolation ${label} ${unique}`,
    email: `timeline-isolation-${label}-${unique}@test.local`,
    password: process.env.E2E_TEST_PASSWORD || 'TestPassword123!',
    orgName: `Timeline Isolation Org ${label} ${unique}`,
  }

  await page.goto('/auth/sign-up')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Name').fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByLabel('Confirm password').fill(account.password)

  await Promise.all([
    page.waitForResponse(
      resp => resp.url().includes('/api/auth/sign-up') && resp.status() === 200,
      { timeout: 30_000 },
    ),
    page.getByRole('button', { name: 'Sign up' }).click(),
  ])

  await page.waitForURL(
    url => url.pathname.includes('/onboarding/') || url.pathname.includes('/auth/sign-in'),
    { waitUntil: 'commit', timeout: 30_000 },
  )

  if (page.url().includes('/auth/sign-in')) {
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill(account.email)
    await page.getByLabel('Password').fill(account.password)
    await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/auth/sign-in') && resp.status() === 200,
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ])
    await page.waitForURL('**/onboarding/**', { waitUntil: 'commit', timeout: 30_000 })
  }

  await page.getByLabel('Organization name').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByLabel('Organization name').fill(account.orgName)
  await page.getByRole('button', { name: 'Create organization' }).click()
  await page.waitForURL('**/dashboard**', { waitUntil: 'commit', timeout: 30_000 })

  return {
    page,
    close: () => context.close(),
  }
}

async function getActivityItems(request: APIRequestContext, resourceType: string, resourceId: string) {
  const response = await request.get(`/api/activity-log?resourceType=${resourceType}&resourceId=${resourceId}&limit=20`)
  await expectStatus(response, 200, 'Activity log API')
  const body = await response.json() as { data: ActivityItem[] }
  return body.data
}

async function getTimeline(request: APIRequestContext): Promise<TimelineResponse> {
  const response = await request.get('/api/activity-log/timeline?limit=50')
  await expectStatus(response, 200, 'Timeline API')
  return await response.json() as TimelineResponse
}

function expectSortedNewestFirst(items: ActivityItem[]) {
  for (let i = 1; i < items.length; i += 1) {
    const previous = Date.parse(items[i - 1]!.createdAt)
    const current = Date.parse(items[i]!.createdAt)
    expect(Number.isFinite(previous), `timeline item ${i - 1} must have a parseable timestamp`).toBe(true)
    expect(Number.isFinite(current), `timeline item ${i} must have a parseable timestamp`).toBe(true)
    expect(previous, `timeline item ${i - 1} must be newer than or tied with item ${i}`).toBeGreaterThanOrEqual(current)
  }
}

test.describe('Activity timeline and audit log', () => {
  test('records representative dashboard mutations in order and keeps them tenant-scoped', async ({ authenticatedPage, browser }, testInfo) => {
    const page = authenticatedPage
    const baseURL = String(testInfo.project.use.baseURL ?? '')
    assertMutatingE2ESafety({
      env: {
        PLAYWRIGHT_BASE_URL: baseURL,
        DATABASE_URL: process.env.DATABASE_URL,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
        NUXT_PUBLIC_SITE_URL: process.env.NUXT_PUBLIC_SITE_URL,
      },
    })

    const unique = `${Date.now()}-r${testInfo.retry}`
    const job = await createJob(page.request, `Activity Timeline Job ${unique}`)
    const candidate = await createTimelineCandidate(page.request, unique)
    const candidateName = `${candidate.firstName} ${candidate.lastName}`
    const application = await createApplication(page.request, {
      candidateId: candidate.id,
      jobId: job.id,
      notes: 'Initial activity timeline E2E application note.',
    })
    await updateApplicationStatus(page.request, application.id, 'screening')
    await createApplicationComment(page.request, application.id, unique)
    const interview = await createInterview(page.request, application.id, unique)

    await expect.poll(async () => {
      const applicationEvents = await getActivityItems(page.request, 'application', application.id)
      return applicationEvents.map(item => item.action)
    }, { timeout: 15_000 }).toEqual(expect.arrayContaining(['created', 'status_changed', 'comment_added']))

    const applicationEvents = await getActivityItems(page.request, 'application', application.id)
    expect(applicationEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'created',
        resourceType: 'application',
        resourceId: application.id,
      }),
      expect.objectContaining({
        action: 'status_changed',
        resourceType: 'application',
        resourceId: application.id,
        metadata: expect.objectContaining({ from: 'new', to: 'screening' }),
      }),
      expect.objectContaining({
        action: 'comment_added',
        resourceType: 'application',
        resourceId: application.id,
      }),
    ]))
    expectSortedNewestFirst(applicationEvents)

    const candidateEvents = await getActivityItems(page.request, 'candidate', candidate.id)
    expect(candidateEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'created',
        resourceType: 'candidate',
        resourceId: candidate.id,
        metadata: expect.objectContaining({ name: candidateName }),
      }),
    ]))

    const interviewEvents = await getActivityItems(page.request, 'interview', interview.id)
    expect(interviewEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'created',
        resourceType: 'interview',
        resourceId: interview.id,
      }),
    ]))

    const timeline = await getTimeline(page.request)
    expectSortedNewestFirst(timeline.items)
    expect(timeline.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'status_changed',
        resourceType: 'application',
        resourceName: expect.stringContaining(candidateName),
        jobName: job.title,
        candidateName,
      }),
      expect.objectContaining({
        action: 'comment_added',
        resourceType: 'application',
        resourceName: expect.stringContaining(candidateName),
        jobName: job.title,
        candidateName,
      }),
      expect.objectContaining({
        action: 'created',
        resourceType: 'interview',
        resourceName: expect.stringContaining(candidateName),
        jobName: job.title,
        candidateName,
      }),
    ]))
    expect(timeline.upcoming).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'scheduled',
        resourceType: 'interview',
        resourceId: interview.id,
        resourceName: expect.stringContaining(candidateName),
        jobName: job.title,
        candidateName,
        isUpcoming: true,
      }),
    ]))

    await page.goto('/dashboard/timeline', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible({ timeout: 15_000 })
    await page.getByLabel('Search timeline').fill(candidate.lastName)
    await expect(page.getByText('Candidate created')).toBeVisible()
    await expect(page.getByText('Application moved')).toBeVisible()
    await expect(page.getByText('Comment added to application')).toBeVisible()
    await expect(page.getByText('Interview created')).toBeVisible()
    await expect(page.getByText('Interview scheduled')).toBeVisible()
    await expect(page.getByText(job.title).first()).toBeVisible()
    await expect(page.getByText(candidateName).first()).toBeVisible()

    const otherOrg = await signUpWithOrganization(browser, baseURL, `other-${testInfo.workerIndex}`)
    try {
      const otherOrgApplicationEvents = await getActivityItems(otherOrg.page.request, 'application', application.id)
      expect(otherOrgApplicationEvents, 'another org must not see application activity by direct resource id').toEqual([])

      const otherOrgCandidateTimelineResponse = await otherOrg.page.request.get(`/api/activity-log/candidate-timeline?candidateId=${candidate.id}`)
      await expectStatus(otherOrgCandidateTimelineResponse, 200, 'Other org candidate timeline API')
      const otherOrgCandidateTimeline = await otherOrgCandidateTimelineResponse.json() as { items: ActivityItem[] }
      expect(otherOrgCandidateTimeline.items, 'another org must not see candidate timeline activity by direct candidate id').toEqual([])

      const otherOrgTimeline = await getTimeline(otherOrg.page.request)
      expect([...otherOrgTimeline.items, ...otherOrgTimeline.upcoming].some(item => item.resourceId === application.id || item.resourceId === interview.id)).toBe(false)
      expect([...otherOrgTimeline.items, ...otherOrgTimeline.upcoming].some(item => item.candidateName === candidateName || item.jobName === job.title)).toBe(false)
    }
    finally {
      await otherOrg.close()
    }
  })
})
