import { test, expect, selectFactorySelectOption } from '../fixtures'
import { advanceToSubmitButton } from '../helpers/application-form'

/**
 * Critical flow: public job board visibility and source attribution.
 *
 * When a candidate arrives through an org-wide tracking link, the public job
 * index should only expose active published jobs. The tracking ref must survive
 * index → detail → apply navigation and persist into recruiter attribution.
 *
 * Recruiter setup:
 * 1. Create multiple jobs in published, draft, closed, and future-active states
 * 2. Create an org-wide tracking link
 *
 * Candidate flow:
 * 3. Open the public tracking URL
 * 4. Verify only the active published job is discoverable from /jobs
 * 5. Open the job from the index and submit the application
 * 6. Verify the tracking link counters and source stats include the application
 */

const JOB_TITLE = 'Source Tracking Test Job'

type JobResponse = {
  id: string
  slug: string
  status: string
}

test.describe('Public job board source attribution', () => {
  test('shows only active published jobs and persists tracking attribution from public discovery', async ({ authenticatedPage, browser }, testInfo) => {
    const page = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`
    const visibleTitle = `${JOB_TITLE} Visible ${unique}`
    const draftTitle = `${JOB_TITLE} Draft ${unique}`
    const closedTitle = `${JOB_TITLE} Closed ${unique}`
    const futureTitle = `${JOB_TITLE} Future ${unique}`
    const linkName = `Public board LinkedIn ${unique}`
    const applicant = {
      firstName: 'Public',
      lastName: 'Board',
      email: `public.board.${unique}@example.com`,
    }

    async function createMinimalJob(title: string): Promise<JobResponse> {
      const response = await page.request.post('/api/jobs', {
        data: {
          title,
          description: `E2E public board fixture for ${title}.`,
          location: 'Remote',
          requireResume: false,
          requireCoverLetter: false,
          applicationComplianceEnabled: false,
          autoScoreOnApply: false,
        },
      })
      expect(response.status(), `Create job API returned ${response.status()} for ${title}`).toBe(201)
      const created = await response.json() as JobResponse
      expect(created.id, `${title} id must be present`).toBeTruthy()
      expect(created.slug, `${title} slug must be present`).toBeTruthy()
      return created
    }

    async function updateJob(id: string, data: Record<string, unknown>): Promise<JobResponse> {
      const response = await page.request.patch(`/api/jobs/${id}`, { data })
      expect(response.status(), `Update job API returned ${response.status()}`).toBe(200)
      return await response.json() as JobResponse
    }

    const visibleJob = await updateJob((await createMinimalJob(visibleTitle)).id, { status: 'open' })
    await createMinimalJob(draftTitle)
    const closedJob = await updateJob((await createMinimalJob(closedTitle)).id, { status: 'open' })
    await updateJob(closedJob.id, { status: 'closed' })
    await updateJob((await createMinimalJob(futureTitle)).id, {
      status: 'open',
      activeFrom: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })

    const createLinkResponse = await page.request.post('/api/tracking-links', {
      data: {
        name: linkName,
        channel: 'linkedin',
        utmSource: 'linkedin',
        utmMedium: 'social',
        utmCampaign: 'public-board-e2e',
      },
    })
    expect(createLinkResponse.status(), `Create tracking link API returned ${createLinkResponse.status()}`).toBe(201)
    const trackingLink = await createLinkResponse.json() as { id: string; code: string }
    expect(trackingLink.id, 'tracking link id must be present').toBeTruthy()
    expect(trackingLink.code, 'tracking link code must be present').toBeTruthy()

    const candidateContext = await browser.newContext()
    const candidatePage = await candidateContext.newPage()

    await candidatePage.goto(`/api/public/track/${trackingLink.code}`)
    await candidatePage.waitForURL('**/jobs?ref=*', { waitUntil: 'commit', timeout: 15_000 })
    await candidatePage.waitForLoadState('networkidle')
    expect(new URL(candidatePage.url()).searchParams.get('ref')).toBe(trackingLink.code)

    await expect(candidatePage.getByText(draftTitle)).toHaveCount(0)
    await expect(candidatePage.getByText(closedTitle)).toHaveCount(0)
    await expect(candidatePage.getByText(futureTitle)).toHaveCount(0)

    const jobLink = candidatePage.getByRole('link', { name: visibleTitle }).first()
    await expect(jobLink).toBeVisible({ timeout: 15_000 })
    await jobLink.click()

    await candidatePage.waitForURL(`**/jobs/${visibleJob.slug}**`, { waitUntil: 'commit', timeout: 10_000 })
    const detailUrl = new URL(candidatePage.url())
    expect(detailUrl.searchParams.get('ref'), 'ref param must survive navigation to job detail').toBe(trackingLink.code)

    await candidatePage.getByRole('link', { name: 'Apply Now' }).first().click()

    await candidatePage.waitForURL(`**/jobs/${visibleJob.slug}/apply**`, { waitUntil: 'commit', timeout: 10_000 })
    const applyUrl = new URL(candidatePage.url())
    expect(applyUrl.searchParams.get('ref'), 'ref param must survive navigation to apply page').toBe(trackingLink.code)

    await candidatePage.getByLabel('First name').fill(applicant.firstName)
    await candidatePage.getByLabel('Last name').fill(applicant.lastName)
    await candidatePage.getByLabel('Email').fill(applicant.email)
    await selectFactorySelectOption(candidatePage, /Country/, 'United States')
    await selectFactorySelectOption(candidatePage, /State/, 'California')
    const submitButton = await advanceToSubmitButton(candidatePage)

    const [applyResponse] = await Promise.all([
      candidatePage.waitForResponse(
        resp =>
          resp.url().includes(`/api/public/jobs/${visibleJob.slug}/apply`) &&
          resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      submitButton.click(),
    ])

    const status = applyResponse.status()
    expect(status, `Apply API returned ${status}`).toBeGreaterThanOrEqual(200)
    expect(status, `Apply API returned ${status}`).toBeLessThan(300)

    const requestBody = applyResponse.request().postDataJSON()
    expect(requestBody.ref, 'POST body must include ref code').toBe(trackingLink.code)

    await candidatePage.waitForURL(`**/jobs/${visibleJob.slug}/confirmation`, {
      waitUntil: 'commit',
      timeout: 15_000,
    })
    await expect(candidatePage.getByRole('heading', { name: 'Application submitted' })).toBeVisible()

    await expect.poll(async () => {
      const response = await page.request.get(`/api/tracking-links/${trackingLink.id}`)
      expect(response.status(), `Tracking link API returned ${response.status()}`).toBe(200)
      return await response.json() as { clickCount: number; applicationCount: number }
    }, {
      message: 'tracking link counters should include public click and application',
      timeout: 10_000,
    }).toEqual(expect.objectContaining({ clickCount: 1, applicationCount: 1 }))

    await expect.poll(async () => {
      const response = await page.request.get(`/api/source-tracking/stats?jobId=${visibleJob.id}`)
      expect(response.status(), `Source stats API returned ${response.status()}`).toBe(200)
      const stats = await response.json() as {
        recentAttributed: Array<{
          candidateEmail: string
          candidateFirstName: string
          candidateLastName: string
          jobTitle: string
          channel: string
          trackingLinkName: string | null
        }>
      }
      return stats.recentAttributed.find(row => row.candidateEmail === applicant.email)
    }, {
      message: 'source attribution should persist for the public application',
      timeout: 10_000,
    }).toEqual(expect.objectContaining({
      candidateFirstName: applicant.firstName,
      candidateLastName: applicant.lastName,
      jobTitle: visibleTitle,
      channel: 'linkedin',
      trackingLinkName: linkName,
    }))

    await candidatePage.close()
    await candidateContext.close()
  })
})
