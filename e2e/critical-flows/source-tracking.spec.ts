import type { Page } from '@playwright/test'
import { test, expect, selectFactorySelectOption } from '../fixtures'

/**
 * Critical flow: Source tracking query parameters (?ref=, utm_*) propagate
 * through the public job browsing and application flow.
 *
 * When a candidate arrives via a tracking link, the redirect lands on
 * /jobs?ref=CODE (org-wide) or /jobs/:slug/apply?ref=CODE (job-scoped).
 * This test verifies that source params survive navigation from the job
 * listing → job detail → apply page, and are included in the POST body.
 *
 * Recruiter setup:
 * 1. Create a minimal job (no resume required, no custom questions)
 * 2. Publish and capture the slug
 *
 * Candidate flow:
 * 3. Open /jobs?ref=TRACK123&utm_source=linkedin (simulates org-wide tracking link)
 * 4. Click on the job → verify ref/utm params are forwarded to the detail page
 * 5. Click "Apply Now" → verify ref/utm params are forwarded to the apply page
 * 6. Submit the application → verify the POST body includes ref + utm_source
 */

const JOB_TITLE = 'Source Tracking Test Job'
const HIDDEN_CLOSED_JOB_TITLE = 'Hidden Closed Source Tracking Job'
const HIDDEN_FUTURE_JOB_TITLE = 'Hidden Future Source Tracking Job'

type CreatedJob = {
  id: string
  slug: string
  status: string
}

async function advanceToSubmitButton(page: Page) {
  const submitButton = page.getByRole('button', { name: /submit/i })

  for (let step = 0; step < 3; step += 1) {
    if (await submitButton.isVisible()) {
      return submitButton
    }

    const continueButton = page.getByRole('button', { name: 'Continue' }).first()
    await expect(continueButton).toBeVisible({ timeout: 10_000 })
    await expect(continueButton).toBeEnabled()
    await continueButton.click()
  }

  await expect(submitButton).toBeVisible({ timeout: 10_000 })
  return submitButton
}

test.describe('Source Tracking — Query Parameter Propagation', () => {
  test('ref and utm params propagate from job listing → detail → apply → submission', async ({ authenticatedPage, browser }, testInfo) => {
    const page = authenticatedPage
    const unique = `${Date.now()} r${testInfo.retry}`
    const jobTitle = `${JOB_TITLE} ${unique}`
    const hiddenClosedJobTitle = `${HIDDEN_CLOSED_JOB_TITLE} ${unique}`
    const hiddenFutureJobTitle = `${HIDDEN_FUTURE_JOB_TITLE} ${unique}`

    // ── Step 1: Create public and hidden jobs through the API ──────────────────

    async function createJob(title: string, activeFrom?: string): Promise<CreatedJob> {
      const response = await page.request.post('/api/jobs', {
        data: {
          title,
          description: 'A fast E2E job for source attribution.',
          location: 'Remote',
          requireResume: false,
          requireCoverLetter: false,
          applicationComplianceEnabled: false,
          autoScoreOnApply: false,
          ...(activeFrom && { activeFrom }),
        },
      })
      expect(response.status(), `Create job API returned ${response.status()} for ${title}`).toBe(201)
      return await response.json() as CreatedJob
    }

    async function updateJobStatus(id: string, status: 'open' | 'closed') {
      const response = await page.request.patch(`/api/jobs/${id}`, { data: { status } })
      expect(response.status(), `Update job status API returned ${response.status()} for ${id}`).toBe(200)
      return await response.json() as CreatedJob
    }

    const publishedJob = await updateJobStatus(
      (await createJob(jobTitle, new Date(Date.now() - 60_000).toISOString())).id,
      'open',
    )
    expect(publishedJob.slug, 'Published job slug must not be empty').toBeTruthy()

    const closedDraftJob = await createJob(hiddenClosedJobTitle, new Date(Date.now() - 60_000).toISOString())
    const openedClosedJob = await updateJobStatus(closedDraftJob.id, 'open')
    const closedJob = await updateJobStatus(openedClosedJob.id, 'closed')
    const futureJob = await updateJobStatus(
      (await createJob(hiddenFutureJobTitle, new Date(Date.now() + 86_400_000).toISOString())).id,
      'open',
    )

    const publicJobsResponse = await page.request.get('/api/public/jobs', {
      params: { search: 'Source Tracking', limit: 20 },
    })
    expect(publicJobsResponse.status(), `Public jobs API returned ${publicJobsResponse.status()}`).toBe(200)
    const publicJobs = await publicJobsResponse.json() as { data: { title: string }[] }
    const publicJobTitles = publicJobs.data.map(j => j.title)
    expect(publicJobTitles, 'open active job should appear on the public board').toContain(jobTitle)
    expect(publicJobTitles, 'closed job should not appear on the public board').not.toContain(hiddenClosedJobTitle)
    expect(publicJobTitles, 'future activeFrom job should not appear on the public board').not.toContain(hiddenFutureJobTitle)

    const [closedDetailResponse, futureDetailResponse] = await Promise.all([
      page.request.get(`/api/public/jobs/${closedJob.slug}`),
      page.request.get(`/api/public/jobs/${futureJob.slug}`),
    ])
    expect(closedDetailResponse.status(), 'closed job detail should not be publicly available').toBe(404)
    expect(futureDetailResponse.status(), 'future job detail should not be publicly available').toBe(404)

    // ── Step 2: Candidate navigates from job listing with tracking params ──────

    const candidateContext = await browser.newContext()
    const candidatePage = await candidateContext.newPage()

    const REF_CODE = 'TRACK_E2E_123'
    const UTM_SOURCE = 'linkedin'

    // Simulate arriving via an org-wide tracking link → /jobs?ref=...&utm_source=...
    await candidatePage.goto(`/jobs?ref=${REF_CODE}&utm_source=${UTM_SOURCE}`)
    await candidatePage.waitForLoadState('networkidle')

    // Find the job listing and click on it
    const jobLink = candidatePage.getByRole('link', { name: jobTitle }).first()
    await expect(jobLink).toBeVisible({ timeout: 15_000 })
    await expect(candidatePage.getByText(hiddenClosedJobTitle)).toHaveCount(0)
    await expect(candidatePage.getByText(hiddenFutureJobTitle)).toHaveCount(0)
    await jobLink.click()

    // ── Verify: job detail page URL contains ref + utm_source ──────────────────

    await candidatePage.waitForURL(`**/jobs/${publishedJob.slug}**`, { waitUntil: 'commit', timeout: 10_000 })
    const detailUrl = new URL(candidatePage.url())
    expect(detailUrl.searchParams.get('ref'), 'ref param must survive navigation to job detail').toBe(REF_CODE)
    expect(detailUrl.searchParams.get('utm_source'), 'utm_source must survive navigation to job detail').toBe(UTM_SOURCE)

    // Click "Apply Now"
    await candidatePage.getByRole('link', { name: 'Apply Now' }).first().click()

    // ── Verify: apply page URL contains ref + utm_source ───────────────────────

    await candidatePage.waitForURL(`**/jobs/${publishedJob.slug}/apply**`, { waitUntil: 'commit', timeout: 10_000 })
    const applyUrl = new URL(candidatePage.url())
    expect(applyUrl.searchParams.get('ref'), 'ref param must survive navigation to apply page').toBe(REF_CODE)
    expect(applyUrl.searchParams.get('utm_source'), 'utm_source must survive navigation to apply page').toBe(UTM_SOURCE)

    // ── Step 3: Fill and submit the application ────────────────────────────────

    const APPLICANT = {
      firstName: 'Tracking',
      lastName: 'Test',
      email: `tracking.test.${Date.now()}.r${testInfo.retry}@example.com`,
    }

    await candidatePage.getByLabel('First name').fill(APPLICANT.firstName)
    await candidatePage.getByLabel('Last name').fill(APPLICANT.lastName)
    await candidatePage.getByLabel('Email').fill(APPLICANT.email)
    await selectFactorySelectOption(candidatePage, /Country/, 'United States')
    await selectFactorySelectOption(candidatePage, /State/, 'California')
    const submitButton = await advanceToSubmitButton(candidatePage)

    // Intercept the POST to verify the body includes source tracking params
    const [applyResponse] = await Promise.all([
      candidatePage.waitForResponse(
        resp =>
          resp.url().includes(`/api/public/jobs/${publishedJob.slug}/apply`) &&
          resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      submitButton.click(),
    ])

    // Verify 2xx response
    const status = applyResponse.status()
    expect(status, `Apply API returned ${status}`).toBeGreaterThanOrEqual(200)
    expect(status, `Apply API returned ${status}`).toBeLessThan(300)

    // Verify the POST body included the tracking params
    const requestBody = applyResponse.request().postDataJSON()
    expect(requestBody.ref, 'POST body must include ref code').toBe(REF_CODE)
    expect(requestBody.utmSource, 'POST body must include utmSource').toBe(UTM_SOURCE)

    // Verify confirmation page
    await candidatePage.waitForURL(`**/jobs/${publishedJob.slug}/confirmation`, {
      waitUntil: 'commit',
      timeout: 15_000,
    })
    await expect(candidatePage.getByRole('heading', { name: 'Application submitted' })).toBeVisible()

    await candidatePage.close()
    await candidateContext.close()
  })
})
