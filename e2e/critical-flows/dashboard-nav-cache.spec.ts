import { test, expect } from '../fixtures'

test.describe('Dashboard list keepalive', () => {
  test('jobs list search survives jobs → candidates → jobs navigation', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const marker = `keepalive-marker-${Date.now()}`

    await page.goto('/dashboard/jobs')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Search jobs').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByLabel('Search jobs').fill(marker)

    await page.getByRole('link', { name: 'Candidates' }).first().click()
    await page.waitForURL('**/dashboard/candidates', { timeout: 15_000 })
    await expect(page.getByLabel('Search candidates')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('link', { name: 'Jobs' }).first().click()
    await page.waitForURL('**/dashboard/jobs', { timeout: 15_000 })

    await expect(page.getByLabel('Search jobs')).toHaveValue(marker, { timeout: 10_000 })
  })
})