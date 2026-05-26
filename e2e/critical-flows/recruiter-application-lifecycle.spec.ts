import type { Page } from '@playwright/test'
import { test, expect, selectFactorySelectOption } from '../fixtures'

const JOB_TITLE = 'Recruiter Lifecycle Test Job'

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

test.describe('Recruiter application lifecycle', () => {
  test('recruiter sees a submitted application and persists a status transition', async ({ authenticatedPage, browser }, testInfo) => {
    const recruiterPage = authenticatedPage
    const jobTitle = `${JOB_TITLE} ${Date.now()} r${testInfo.retry}`
    const applicant = {
      firstName: 'Lifecycle',
      lastName: 'Candidate',
      email: `lifecycle.candidate.${Date.now()}.r${testInfo.retry}@example.com`,
    }
    const applicantName = `${applicant.firstName} ${applicant.lastName}`

    await recruiterPage.goto('/dashboard/jobs/new')
    await recruiterPage.waitForLoadState('networkidle')
    await recruiterPage.getByLabel('Job title').waitFor({ state: 'visible', timeout: 15_000 })
    await recruiterPage.getByLabel('Job title').fill(jobTitle)

    await recruiterPage.locator('form').getByRole('button', { name: 'Save & continue' }).first().waitFor({ state: 'attached', timeout: 10_000 })
    await expect(recruiterPage.locator('form').getByRole('button', { name: 'Save & continue' }).first()).toBeEnabled({ timeout: 10_000 })
    await recruiterPage.locator('form').getByRole('button', { name: 'Save & continue' }).first().click()

    const resumeRadioGroup = recruiterPage.getByRole('radiogroup', { name: /Resume requirement/i })
    await resumeRadioGroup.waitFor({ state: 'visible', timeout: 10_000 })
    await resumeRadioGroup.getByRole('radio', { name: 'Off' }).click()

    await recruiterPage.locator('form').getByRole('button', { name: 'Save & continue' }).first().click()
    await recruiterPage.locator('form').getByRole('button', { name: 'Save & continue' }).first().waitFor({ state: 'visible', timeout: 10_000 })
    await recruiterPage.locator('form').getByRole('button', { name: 'Save & continue' }).first().click()

    await expect(recruiterPage.getByRole('heading', { name: /Ready to go\?/i })).toBeVisible({ timeout: 10_000 })
    const publishButton = recruiterPage.locator('form').getByRole('button', { name: /Publish & copy link/i })
    await publishButton.waitFor({ state: 'visible', timeout: 10_000 })

    const [publishResponse] = await Promise.all([
      recruiterPage.waitForResponse(
        resp => resp.url().includes('/api/jobs') && ['POST', 'PATCH'].includes(resp.request().method()),
        { timeout: 30_000 },
      ),
      publishButton.click(),
    ])
    expect([200, 201], `Publish API returned ${publishResponse.status()}`).toContain(publishResponse.status())
    const publishedJob = await publishResponse.json() as { id: string; slug: string }
    expect(publishedJob.id, 'published job id must be present').toBeTruthy()
    expect(publishedJob.slug, 'published job slug must be present').toBeTruthy()
    await expect(recruiterPage.getByRole('heading', { name: 'Your job is live!' })).toBeVisible({ timeout: 30_000 })

    const candidateContext = await browser.newContext()
    const candidatePage = await candidateContext.newPage()
    await candidatePage.goto(`/jobs/${publishedJob.slug}/apply`)
    await candidatePage.waitForLoadState('networkidle')
    await candidatePage.getByLabel('First name').fill(applicant.firstName)
    await candidatePage.getByLabel('Last name').fill(applicant.lastName)
    await candidatePage.getByLabel('Email').fill(applicant.email)
    await selectFactorySelectOption(candidatePage, /Country/, 'United States')
    await selectFactorySelectOption(candidatePage, /State/, 'California')

    const submitButton = await advanceToSubmitButton(candidatePage)
    const [applyResponse] = await Promise.all([
      candidatePage.waitForResponse(
        resp => resp.url().includes(`/api/public/jobs/${publishedJob.slug}/apply`) && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      submitButton.click(),
    ])
    expect(applyResponse.status(), `Apply API returned ${applyResponse.status()}`).toBe(201)
    await candidatePage.waitForURL(`**/jobs/${publishedJob.slug}/confirmation`, { waitUntil: 'commit', timeout: 15_000 })
    await expect(candidatePage.getByRole('heading', { name: 'Application submitted' })).toBeVisible()
    await candidateContext.close()

    await recruiterPage.goto(`/dashboard/jobs/${publishedJob.id}/candidates`)
    await recruiterPage.waitForLoadState('networkidle')

    const candidateRow = recruiterPage.getByRole('row').filter({ hasText: applicant.email })
    await expect(candidateRow).toBeVisible({ timeout: 15_000 })
    await expect(candidateRow).toContainText(applicantName)
    await expect(candidateRow).toContainText('New')
    await candidateRow.getByText(applicantName, { exact: true }).click()

    const drawer = recruiterPage.locator('aside.ui-drawer-panel')
    await expect(drawer.getByRole('heading', { name: applicantName })).toBeVisible({ timeout: 10_000 })
    await expect(drawer).toContainText(applicant.email)

    const [statusResponse] = await Promise.all([
      recruiterPage.waitForResponse(
        resp => /\/api\/applications\/[^/]+$/.test(new URL(resp.url()).pathname) && resp.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      drawer.getByRole('button', { name: 'Screening' }).click(),
    ])
    expect(statusResponse.status(), `Status PATCH returned ${statusResponse.status()}`).toBe(200)
    const updatedApplication = await statusResponse.json() as { id: string; status: string }
    expect(updatedApplication.status).toBe('screening')

    const applicationListResponse = await recruiterPage.request.get(`/api/applications?jobId=${publishedJob.id}`)
    expect(applicationListResponse.status(), `Applications API returned ${applicationListResponse.status()}`).toBe(200)
    const applicationList = await applicationListResponse.json() as { data: Array<{ id: string; status: string; candidateEmail: string }> }
    expect(applicationList.data).toContainEqual(expect.objectContaining({
      id: updatedApplication.id,
      status: 'screening',
      candidateEmail: applicant.email,
    }))

    await recruiterPage.reload()
    await recruiterPage.waitForLoadState('networkidle')
    const reloadedRow = recruiterPage.getByRole('row').filter({ hasText: applicant.email })
    await expect(reloadedRow).toBeVisible({ timeout: 15_000 })
    await expect(reloadedRow).toContainText('Screening')
  })
})
