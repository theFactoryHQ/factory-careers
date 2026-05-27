import { type Page } from '@playwright/test'
import { test, expect, type TestAccount } from '../fixtures'

async function signUpAndCreateOrganization(page: Page, account: TestAccount) {
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
}

test.describe('Production build session cache boundaries', () => {
  test('does not reuse unauthenticated dashboard cache after signup and reload', async ({ page, testAccount }) => {
    const unauthenticatedStats = await page.request.get('/api/dashboard/stats')
    expect(
      [401, 403],
      `Unauthenticated dashboard stats API returned ${unauthenticatedStats.status()}`,
    ).toContain(unauthenticatedStats.status())

    await signUpAndCreateOrganization(page, testAccount)
    await expect(page.getByRole('heading', { name: 'Welcome to Factory Careers' })).toBeVisible({ timeout: 15_000 })

    const signedInStats = await page.request.get('/api/dashboard/stats')
    expect(signedInStats.status(), `Signed-in dashboard stats API returned ${signedInStats.status()}`).toBe(200)

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Welcome to Factory Careers' })).toBeVisible({ timeout: 15_000 })
    await expect(page).not.toHaveURL(/\/auth\/sign-in/)

    const reloadedStats = await page.request.get('/api/dashboard/stats')
    expect(reloadedStats.status(), `Reloaded dashboard stats API returned ${reloadedStats.status()}`).toBe(200)

    await page.goto('/dashboard/settings', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'General' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Organization name')).toHaveValue(testAccount.orgName)

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'General' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Organization name')).toHaveValue(testAccount.orgName)
  })
})
