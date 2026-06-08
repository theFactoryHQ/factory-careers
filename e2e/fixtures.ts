import { expect as baseExpect, test as base, type Locator, type Page } from '@playwright/test'
import { createOrganizationOnPage, signUpOnPage } from './helpers/auth'

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
  authenticatedPageWithoutOrg: Page
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

export {
  expectFocusRestored,
  expectVisibleFocus,
  openWithKeyboard,
  runAxeScan,
} from './accessibility'

export { createGuestPage, withGuestContext } from './helpers/guest-context'
export { signUpUser } from './helpers/auth'

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
    await signUpOnPage(page, testAccount)
    await createOrganizationOnPage(page, testAccount.orgName)
    await use(page)
  },

  authenticatedPageWithoutOrg: async ({ page, testAccount }, use) => {
    await signUpOnPage(page, testAccount)
    await page.getByLabel('Organization name').waitFor({ state: 'visible', timeout: 30_000 })
    await use(page)
  },
})

export { expect } from '@playwright/test'