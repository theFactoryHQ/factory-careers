import { test, expect } from '../fixtures'
import { expectNoA11yViolations, expectVisibleKeyboardFocus, tabUntilFocused } from '../accessibility'

test.describe('Accessibility and keyboard harness', () => {
  test('keeps public and auth entry points axe-clean with keyboard-visible focus', async ({ page }) => {
    await page.goto('/jobs')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Open Positions', exact: true })).toBeVisible()
    await expectNoA11yViolations(page, { include: 'main' })

    const searchInput = page.getByLabel('Search jobs')
    await tabUntilFocused(page, searchInput)

    await page.goto('/auth/sign-in')
    await page.waitForLoadState('networkidle')
    await expect(page.getByLabel('Work email')).toBeVisible()
    await expectNoA11yViolations(page)

    await tabUntilFocused(page, page.getByLabel('Work email'))
    await tabUntilFocused(page, page.getByRole('button', { name: 'Sign in with Microsoft' }))
  })

  test('closes public listboxes with Escape and restores focus', async ({ page }) => {
    await page.goto('/jobs')
    await page.waitForLoadState('networkidle')

    const typeFilter = page.getByRole('button', { name: 'All types' })
    await typeFilter.focus()
    await expectVisibleKeyboardFocus(typeFilter)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listbox')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(typeFilter).toBeFocused()
  })

  test('keeps dashboard shell navigation keyboard-operable on mobile', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /Dashboard|Welcome/i })).toBeVisible()
    await expectNoA11yViolations(page, { include: 'header' })

    const navButton = page.getByRole('button', { name: 'Open navigation menu' })
    await navButton.focus()
    await expectVisibleKeyboardFocus(navButton)
    await page.keyboard.press('Enter')

    const closeButton = page.getByRole('button', { name: 'Close navigation menu' })
    await expect(closeButton).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#dashboard-mobile-navigation')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('#dashboard-mobile-navigation')).toHaveCount(0)
    await expect(navButton).toBeFocused()
  })
})
