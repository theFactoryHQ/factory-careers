import { AxeBuilder } from '@axe-core/playwright'
import { expect, expect as baseExpect, test as base, type Locator, type Page } from '@playwright/test'

/**
 * Shared test fixtures for Reqcore E2E tests.
 *
 * Provides a unique test account per worker so parallel runs
 * won't clash (currently single-worker, but future-proofed).
 */

export interface TestAccount {
  name: string
  email: string
  password: string
  orgName: string
  orgSlug: string
}

function generateTestAccount(workerId: number): TestAccount {
  const id = `${Date.now()}-${workerId}`
  return {
    name: `E2E Tester ${id}`,
    email: `e2e-${id}@test.local`,
    password: process.env.E2E_TEST_PASSWORD || 'TestPassword123!',
    orgName: `E2E Org ${id}`,
    orgSlug: `e2e-org-${id}`,
  }
}

type Fixtures = {
  testAccount: TestAccount
  authenticatedPage: Page
}

export async function selectFactorySelectOption(page: Page, label: string | RegExp, optionName: string) {
  await page.getByLabel(label).click()
  await page.getByRole('option', { name: optionName, exact: true }).click()
}

export async function expectFloatingMenuNotClipped(menu: Locator) {
  const clippingReport = await menu.evaluate((element) => {
    const menuRect = element.getBoundingClientRect()
    const clippingAncestors: Array<{
      tagName: string
      className: string
      overflow: string
      overflowX: string
      overflowY: string
      rect: { top: number, right: number, bottom: number, left: number }
    }> = []

    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor)
      const clips = [style.overflow, style.overflowX, style.overflowY].some(value =>
        ['hidden', 'clip', 'auto', 'scroll'].includes(value),
      )
      if (!clips) continue

      const ancestorRect = ancestor.getBoundingClientRect()
      const protrudes =
        menuRect.top < ancestorRect.top - 1 ||
        menuRect.right > ancestorRect.right + 1 ||
        menuRect.bottom > ancestorRect.bottom + 1 ||
        menuRect.left < ancestorRect.left - 1

      if (protrudes) {
        clippingAncestors.push({
          tagName: ancestor.tagName.toLowerCase(),
          className: ancestor.className,
          overflow: style.overflow,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          rect: {
            top: ancestorRect.top,
            right: ancestorRect.right,
            bottom: ancestorRect.bottom,
            left: ancestorRect.left,
          },
        })
      }
    }

    return {
      menuRect: {
        top: menuRect.top,
        right: menuRect.right,
        bottom: menuRect.bottom,
        left: menuRect.left,
      },
      clippingAncestors,
    }
  })

  baseExpect(clippingReport.clippingAncestors, JSON.stringify(clippingReport, null, 2)).toEqual([])
}

export async function openWithKeyboard(page: Page, trigger: Locator) {
  await page.waitForLoadState('networkidle')
  await trigger.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

export async function expectFocusRestored(page: Page, trigger: Locator) {
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
}

export async function expectVisibleFocus(page: Page) {
  const focusStyle = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return null
    const styles = window.getComputedStyle(el)
    return {
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
      boxShadow: styles.boxShadow,
    }
  })

  expect(focusStyle).not.toBeNull()
  expect(
    focusStyle!.outlineStyle !== 'none'
      || focusStyle!.outlineWidth !== '0px'
      || focusStyle!.boxShadow !== 'none',
  ).toBeTruthy()
}

export async function runAxeScan(page: Page) {
  const results = await new AxeBuilder({ page })
    .disableRules([
      'color-contrast',
      'heading-order',
      'landmark-main-is-top-level',
      'landmark-no-duplicate-main',
      'landmark-unique',
      'page-has-heading-one',
      'region',
    ])
    .analyze()

  expect(results.violations).toEqual([])
}

export const test = base.extend<Fixtures>({
  testAccount: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const account = generateTestAccount(workerInfo.workerIndex)
      await use(account)
    },
    { scope: 'test' },
  ],

  authenticatedPage: async ({ page, testAccount }, use) => {
    // Sign up
    await page.goto('/auth/sign-up')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Name').fill(testAccount.name)
    await page.getByLabel('Email').fill(testAccount.email)
    await page.getByLabel('Password', { exact: true }).fill(testAccount.password)
    await page.getByLabel('Confirm password').fill(testAccount.password)

    // Click sign-up and wait for the auth API response before expecting navigation
    await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/auth/sign-up') && resp.status() === 200,
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Sign up' }).click(),
    ])

    // After sign-up the app navigates to /onboarding/create-org, but the
    // auth middleware may not yet recognise the freshly-set session cookie
    // and redirect to /auth/sign-in instead.  Handle both outcomes.
    await page.waitForURL(
      url => url.pathname.includes('/onboarding/') || url.pathname.includes('/auth/sign-in'),
      { waitUntil: 'commit', timeout: 30_000 },
    )

    // If we landed on sign-in, explicitly sign in with the new credentials
    if (page.url().includes('/auth/sign-in')) {
      await page.waitForLoadState('networkidle')
      await page.getByLabel('Email').fill(testAccount.email)
      await page.getByLabel('Password').fill(testAccount.password)

      await Promise.all([
        page.waitForResponse(
          resp => resp.url().includes('/api/auth/sign-in') && resp.status() === 200,
          { timeout: 30_000 },
        ),
        page.getByRole('button', { name: 'Sign in' }).click(),
      ])

      // Sign-in navigates to /dashboard, then require-org middleware
      // redirects to /onboarding/create-org (user has no org yet)
      await page.waitForURL('**/onboarding/**', { waitUntil: 'commit', timeout: 30_000 })
    }

    // Wait for the org-creation form to render (loading spinner may show first)
    await page.getByLabel('Organization name').waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByLabel('Organization name').fill(testAccount.orgName)
    await page.getByRole('button', { name: 'Create organization' }).click()

    // Wait for redirect to dashboard (use 'commit' for SPA navigation)
    await page.waitForURL('**/dashboard**', { waitUntil: 'commit' })

    await use(page)
  },
})

export { expect } from '@playwright/test'
