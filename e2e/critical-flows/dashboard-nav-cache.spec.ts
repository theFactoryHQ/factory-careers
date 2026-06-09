import { test, expect } from '../fixtures'

test.describe('Dashboard list keepalive', () => {
  test('candidates search survives candidates → applications → candidates navigation', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const marker = `keepalive-marker-${Date.now()}`

    await page.goto('/dashboard/candidates')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Search candidates').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByLabel('Search candidates').fill(marker)

    const topNav = page.getByRole('banner')
    await topNav.getByRole('link', { name: 'Applications' }).click()
    await page.waitForURL('**/dashboard/applications', { timeout: 15_000 })
    await expect(page.getByLabel('Search applications')).toBeVisible({ timeout: 15_000 })

    await topNav.getByRole('link', { name: 'Candidates' }).click()
    await page.waitForURL('**/dashboard/candidates', { timeout: 15_000 })

    await expect(page.getByLabel('Search candidates')).toHaveValue(marker, { timeout: 10_000 })
  })
})