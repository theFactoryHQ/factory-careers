import { test, expect, selectFactorySelectOption } from '../fixtures'

const JOB_TITLE = 'Tracking Analytics Test Job'
const LINK_NAME = 'LinkedIn Analytics Campaign'
const UTM_CAMPAIGN = 'tracking-analytics-e2e'

test.describe('Tracking analytics', () => {
  test('creates a tracking link and reflects tracked applications in recruiter analytics UI', async ({ authenticatedPage, browser }, testInfo) => {
    const page = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`
    const jobTitle = `${JOB_TITLE} ${unique}`
    const linkName = `${LINK_NAME} ${unique}`
    const applicant = {
      firstName: 'Tracked',
      lastName: 'Applicant',
      email: `tracked.applicant.${unique}@example.com`,
    }
    const applicantName = `${applicant.firstName} ${applicant.lastName}`

    await page.addInitScript(() => {
      const copiedUrls: string[] = []
      Object.defineProperty(window, '__copiedTrackingUrls', {
        value: copiedUrls,
        configurable: true,
      })
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (text: string) => {
            copiedUrls.push(text)
          },
        },
        configurable: true,
      })
    })

    const createJobResponse = await page.request.post('/api/jobs', {
      data: {
        title: jobTitle,
        description: 'A fast E2E job for tracking-link analytics.',
        location: 'Remote',
        requireResume: false,
        requireCoverLetter: false,
        applicationComplianceEnabled: false,
        autoScoreOnApply: false,
      },
    })
    expect(createJobResponse.status(), `Create job API returned ${createJobResponse.status()}`).toBe(201)
    const createdJob = await createJobResponse.json() as { id: string; slug: string }
    expect(createdJob.id, 'created job id must be present').toBeTruthy()
    expect(createdJob.slug, 'created job slug must be present').toBeTruthy()

    const publishJobResponse = await page.request.patch(`/api/jobs/${createdJob.id}`, {
      data: { status: 'open' },
    })
    expect(publishJobResponse.status(), `Publish job API returned ${publishJobResponse.status()}`).toBe(200)
    const publishedJob = await publishJobResponse.json() as { id: string; slug: string; status: string }
    expect(publishedJob.status).toBe('open')

    await page.goto('/dashboard/source-tracking?tab=links')
    await expect(page.getByRole('heading', { name: 'Tracking', exact: true })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /New Link|Create Tracking Link/ }).first().click()
    await expect(page.getByRole('heading', { name: 'Create Tracking Link' })).toBeVisible()
    await page.getByLabel('Link Name').fill(linkName)
    await selectFactorySelectOption(page, /Source Channel/, 'LinkedIn')
    await page.getByText('UTM Parameters (optional)').click()
    await page.getByLabel('utm_source').fill('linkedin')
    await page.getByLabel('utm_medium').fill('social')
    await page.getByLabel('utm_campaign').fill(UTM_CAMPAIGN)

    const [createLinkResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/tracking-links') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.locator('form').getByRole('button', { name: 'Create Link' }).click(),
    ])
    expect(createLinkResponse.status(), `Create link API returned ${createLinkResponse.status()}`).toBe(201)
    const trackingLink = await createLinkResponse.json() as { id: string; code: string }
    expect(trackingLink.id, 'tracking link id must be present').toBeTruthy()
    expect(trackingLink.code, 'tracking link code must be present').toBeTruthy()
    await expect(page.getByRole('heading', { name: 'Create Tracking Link' })).toBeHidden({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Tracking Links' }).click()
    const linkRow = page.getByRole('row').filter({ hasText: linkName })
    await expect(linkRow).toBeVisible({ timeout: 15_000 })
    await expect(linkRow).toContainText('?ref=')

    await linkRow.getByRole('button', { name: 'Copy tracking URL' }).click()
    const copiedUrls = await page.evaluate(() => (window as any).__copiedTrackingUrls as string[])
    expect(copiedUrls.at(-1)).toContain(`/api/public/track/${encodeURIComponent(trackingLink.code)}`)

    const candidateContext = await browser.newContext()
    const candidatePage = await candidateContext.newPage()
    await candidatePage.goto(`/api/public/track/${trackingLink.code}`)
    await candidatePage.waitForURL('**/jobs?ref=*', { waitUntil: 'commit', timeout: 15_000 })
    expect(new URL(candidatePage.url()).searchParams.get('ref')).toBe(trackingLink.code)

    await candidatePage.getByRole('link', { name: jobTitle }).first().click()
    await candidatePage.waitForURL(`**/jobs/${publishedJob.slug}**`, { waitUntil: 'commit', timeout: 15_000 })
    await candidatePage.getByRole('link', { name: 'Apply Now' }).first().click()
    await candidatePage.waitForURL(`**/jobs/${publishedJob.slug}/apply**`, { waitUntil: 'commit', timeout: 15_000 })
    expect(new URL(candidatePage.url()).searchParams.get('ref')).toBe(trackingLink.code)

    const applyResponse = await candidatePage.request.post(`/api/public/jobs/${publishedJob.slug}/apply`, {
      data: {
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        email: applicant.email,
        country: 'United States',
        state: 'CA',
        ref: trackingLink.code,
        utmSource: 'linkedin',
        utmMedium: 'social',
        utmCampaign: UTM_CAMPAIGN,
        responses: [],
      },
    })
    expect(applyResponse.status(), `Apply API returned ${applyResponse.status()}`).toBe(201)

    await expect.poll(async () => {
      const response = await page.request.get(`/api/tracking-links/${trackingLink.id}`)
      expect(response.status(), `Tracking link API returned ${response.status()}`).toBe(200)
      const current = await response.json() as { clickCount: number; applicationCount: number }
      return current
    }, {
      message: 'tracking link counters should include the click and submitted application',
      timeout: 10_000,
    }).toEqual(expect.objectContaining({ clickCount: 1, applicationCount: 1 }))

    await page.goto('/dashboard/source-tracking?tab=links')
    const updatedLinkRow = page.getByRole('row').filter({ hasText: linkName })
    await expect(updatedLinkRow).toBeVisible({ timeout: 15_000 })
    await expect(updatedLinkRow.locator('td').nth(3)).toHaveText('1')
    await expect(updatedLinkRow.locator('td').nth(4)).toHaveText('1')
    await expect(updatedLinkRow.locator('td').nth(5)).toHaveText('100%')

    await page.goto('/dashboard/source-tracking?tab=table')
    const attributionRow = page.getByRole('row').filter({ hasText: applicantName })
    await expect(attributionRow).toBeVisible({ timeout: 15_000 })
    await expect(attributionRow).toContainText(jobTitle)
    await expect(attributionRow).toContainText('LinkedIn')
    await expect(attributionRow).toContainText(`via ${linkName}`)

    await candidateContext.close()
  })
})
