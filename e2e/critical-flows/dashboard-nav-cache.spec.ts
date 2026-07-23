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

  test('application status follows filtered and unfiltered dashboard entry points', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const topNav = page.getByRole('banner')

    await page.goto('/dashboard/applications?status=screening')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Filters' }).click()

    let filterDrawer = page.getByRole('dialog', { name: 'Filter applications' })
    await expect(filterDrawer.getByRole('button', { name: 'Screening' })).toHaveClass(/is-active/)
    await filterDrawer.getByRole('button', { name: 'Close' }).click()

    await topNav.getByRole('link', { name: 'Dashboard' }).click()
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    await page.getByRole('main').getByRole('link', { name: /Applications.*Total received/i }).click()
    await expect(page).toHaveURL(/\/dashboard\/applications$/)
    await page.getByRole('button', { name: 'Filters' }).click()

    filterDrawer = page.getByRole('dialog', { name: 'Filter applications' })
    await expect(filterDrawer.getByRole('button', { name: 'Any' })).toHaveClass(/is-active/)
    await filterDrawer.getByRole('button', { name: 'Close' }).click()

    await topNav.getByRole('link', { name: 'Dashboard' }).click()
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    await page.getByRole('main').getByRole('link', { name: /To Review/i }).click()
    await expect(page).toHaveURL(/\/dashboard\/applications\?status=new$/)
    await page.getByRole('button', { name: 'Filters' }).click()

    filterDrawer = page.getByRole('dialog', { name: 'Filter applications' })
    await expect(filterDrawer.getByRole('button', { name: 'New' })).toHaveClass(/is-active/)
  })
})
