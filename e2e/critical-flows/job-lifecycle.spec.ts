import { test, expect } from '../fixtures'

const JOB_TITLE = 'Lifecycle Close Test Job'
const JOB_DESCRIPTION = 'A published job used to verify close/unpublish behavior.'
const JOB_LOCATION = 'Remote'

test.describe('Job lifecycle after publish', () => {
  test('closing a published job updates the dashboard and blocks public applications', async ({ authenticatedPage, browser }, testInfo) => {
    const page = authenticatedPage
    const jobTitle = `${JOB_TITLE} ${Date.now()} r${testInfo.retry}`

    await page.goto('/dashboard/jobs/new')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Job title').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByLabel('Job title').fill(jobTitle)
    await page.locator('textarea').first().fill(JOB_DESCRIPTION)
    await page.getByLabel('Location').fill(JOB_LOCATION)

    await page.locator('form').getByRole('button', { name: 'Save & continue' }).first().waitFor({ state: 'attached', timeout: 10_000 })
    await expect(page.locator('form').getByRole('button', { name: 'Save & continue' }).first()).toBeEnabled({ timeout: 10_000 })
    await page.locator('form').getByRole('button', { name: 'Save & continue' }).first().click()

    await page.locator('form').getByRole('button', { name: 'Save & continue' }).first().waitFor({ state: 'attached', timeout: 10_000 })
    await expect(page.locator('form').getByRole('button', { name: 'Save & continue' }).first()).toBeEnabled({ timeout: 10_000 })
    await page.locator('form').getByRole('button', { name: 'Save & continue' }).first().click()

    await page.locator('form').getByRole('button', { name: 'Save & continue' }).first().waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('form').getByRole('button', { name: 'Save & continue' }).first().click()

    await expect(page.getByRole('heading', { name: /Ready to go\?/i })).toBeVisible({ timeout: 10_000 })
    const publishButton = page.locator('form').getByRole('button', { name: /Publish & copy link/i })
    await publishButton.waitFor({ state: 'visible', timeout: 10_000 })
    const [publishResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/jobs/') && resp.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      publishButton.click(),
    ])
    expect([200, 201], `Publish API returned ${publishResponse.status()}`).toContain(publishResponse.status())
    const publishedJob = await publishResponse.json() as { id: string; slug: string; status: string }
    expect(publishedJob.id, 'published job id must be present').toBeTruthy()
    expect(publishedJob.slug, 'published job slug must be present').toBeTruthy()
    expect(publishedJob.status).toBe('open')
    await expect(page.getByRole('heading', { name: 'Your job is live!' })).toBeVisible({ timeout: 30_000 })

    const publicContext = await browser.newContext()
    const publicPage = await publicContext.newPage()
    await publicPage.goto(`/jobs/${publishedJob.slug}`)
    await expect(publicPage.getByRole('heading', { name: jobTitle })).toBeVisible({ timeout: 15_000 })
    await expect(publicPage.getByRole('link', { name: /apply/i }).first()).toBeVisible()

    await page.goto(`/dashboard/jobs/${publishedJob.id}`)
    await page.waitForLoadState('networkidle')
    const dashboardBanner = page.getByRole('banner')
    await expect(page.getByText(jobTitle).first()).toBeVisible({ timeout: 15_000 })
    await expect(dashboardBanner).toContainText('Open')

    const closeButton = page.getByRole('button', { name: /Close this job so new candidates can no longer apply/i })
    await expect(closeButton).toBeVisible({ timeout: 15_000 })
    const [closeResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes(`/api/jobs/${publishedJob.id}`) && resp.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      closeButton.click(),
    ])
    expect(closeResponse.status(), `Close API returned ${closeResponse.status()}`).toBe(200)
    const closedJob = await closeResponse.json() as { id: string; status: string }
    expect(closedJob).toEqual(expect.objectContaining({ id: publishedJob.id, status: 'closed' }))

    const jobResponse = await page.request.get(`/api/jobs/${publishedJob.id}`)
    expect(jobResponse.status(), `Job API returned ${jobResponse.status()}`).toBe(200)
    await expect(await jobResponse.json()).toEqual(expect.objectContaining({ status: 'closed' }))
    await expect(dashboardBanner).toContainText('Closed', { timeout: 10_000 })

    await publicPage.goto(`/jobs/${publishedJob.slug}`)
    await expect(publicPage.getByRole('heading', { name: 'Job Not Found' })).toBeVisible({ timeout: 15_000 })
    await publicPage.goto(`/jobs/${publishedJob.slug}/apply`)
    await expect(publicPage.getByRole('heading', { name: 'Position Not Found' })).toBeVisible({ timeout: 15_000 })

    const applyAfterCloseResponse = await publicPage.request.post(`/api/public/jobs/${publishedJob.slug}/apply`, {
      data: {
        firstName: 'Closed',
        lastName: 'Applicant',
        email: `closed.applicant.${Date.now()}.r${testInfo.retry}@example.com`,
        country: 'United States',
        state: 'CA',
        responses: [],
      },
    })
    expect(applyAfterCloseResponse.status(), 'Closed jobs must reject public application POSTs').toBe(404)
    expect(await applyAfterCloseResponse.text()).toContain('not accepting applications')

    await publicContext.close()
  })
})
