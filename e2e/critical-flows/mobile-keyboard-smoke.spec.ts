import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'

type JobFixture = {
  id: string
  slug: string
  status: string
  title: string
}

async function createPublishedJob(page: Page, title: string): Promise<JobFixture> {
  const createResponse = await page.request.post('/api/jobs', {
    data: {
      title,
      description: `Mobile keyboard smoke fixture for ${title}`,
      location: 'Remote',
      type: 'full_time',
      requireResume: false,
      requireCoverLetter: false,
      applicationComplianceEnabled: false,
      autoScoreOnApply: false,
    },
  })

  expect(createResponse.status(), `Create job API returned ${createResponse.status()}`).toBe(201)
  const created = await createResponse.json() as JobFixture

  const publishResponse = await page.request.patch(`/api/jobs/${created.id}`, {
    data: { status: 'open' },
  })

  expect(publishResponse.status(), `Publish job API returned ${publishResponse.status()}`).toBe(200)
  const published = await publishResponse.json() as JobFixture
  expect(published.status).toBe('open')

  return published
}

test.describe('Mobile navigation and keyboard smoke', () => {
  test('keeps public apply entry and dashboard navigation usable on mobile', async ({ authenticatedPage, browser }, testInfo) => {
    const adminPage = authenticatedPage
    const jobTitle = `Mobile Keyboard ${Date.now()} r${testInfo.retry}`
    const publishedJob = await createPublishedJob(adminPage, jobTitle)

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })

    try {
      const publicPage = await mobileContext.newPage()
      await publicPage.goto('/jobs')
      await publicPage.waitForLoadState('networkidle')

      await expect(publicPage.getByRole('heading', { name: 'Open Positions' })).toBeVisible()

      const searchInput = publicPage.getByLabel('Search jobs')
      const searchButton = publicPage.getByRole('button', { name: 'Open search' })
      const typeFilter = publicPage.getByRole('button', { name: 'All types' })

      await searchInput.focus()
      await expect(searchInput).toBeFocused()
      await publicPage.keyboard.press('Tab')
      await expect(searchButton).toBeFocused()
      await publicPage.keyboard.press('Tab')
      await expect(typeFilter).toBeFocused()
      await typeFilter.click()
      await expect(publicPage.getByRole('listbox')).toBeVisible()
      await publicPage.keyboard.press('Escape')
      await expect(publicPage.getByRole('listbox')).toHaveCount(0)
      await expect(typeFilter).toBeFocused()

      await expect(publicPage.getByRole('link').filter({ hasText: jobTitle })).toBeVisible()
      await publicPage.goto(`/jobs/${publishedJob.slug}`)
      await expect(publicPage.getByRole('heading', { name: jobTitle })).toBeVisible()
      await publicPage.getByRole('link', { name: /Apply Now/i }).click()
      await expect(publicPage.getByRole('heading', { name: jobTitle })).toBeVisible()
      await expect(publicPage.getByRole('heading', { name: 'Your application' })).toBeVisible()
    }
    finally {
      await mobileContext.close()
    }

    await adminPage.setViewportSize({ width: 390, height: 844 })
    await adminPage.goto('/dashboard')
    await adminPage.waitForLoadState('networkidle')
    await expect(adminPage.getByRole('heading', { name: /Dashboard|Welcome/i })).toBeVisible()

    const navButton = adminPage.getByRole('button', { name: 'Open navigation menu' })
    await expect(navButton).toBeVisible()
    await navButton.click()
    await expect(adminPage.getByRole('button', { name: 'Close navigation menu' })).toHaveAttribute('aria-expanded', 'true')

    await adminPage.getByRole('link', { name: 'Settings' }).click()
    await expect(adminPage).toHaveURL(/\/dashboard\/settings/)
    await expect(adminPage.getByRole('heading', { name: 'General' })).toBeVisible()
  })
})
