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

  test('operates public listboxes and language picker from the keyboard', async ({ page }) => {
    await page.goto('/jobs')
    await page.waitForLoadState('networkidle')

    const typeFilter = page.getByRole('button', { name: 'All types' })
    await typeFilter.focus()
    await expectVisibleKeyboardFocus(typeFilter)
    await page.keyboard.press('Enter')
    const typeListboxId = await typeFilter.getAttribute('aria-controls')
    expect(typeListboxId).toBeTruthy()
    await expect(page.locator(`#${typeListboxId}`)).toBeVisible()
    await expect(typeFilter).toHaveAttribute('aria-activedescendant', /-option-0$/)

    await page.keyboard.press('ArrowDown')
    await expect(typeFilter).toHaveAttribute('aria-activedescendant', /-option-1$/)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Full-time' })).toBeVisible()
    await expect(page.getByRole('listbox')).toHaveCount(0)

    const selectedTypeFilter = page.getByRole('button', { name: 'Full-time' })
    await selectedTypeFilter.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listbox')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(selectedTypeFilter).toBeFocused()

    const languagePicker = page.getByRole('button', { name: /select language/i }).first()
    await languagePicker.focus()
    await expectVisibleKeyboardFocus(languagePicker)
    await page.keyboard.press('Enter')
    const languageListboxId = await languagePicker.getAttribute('aria-controls')
    expect(languageListboxId).toBeTruthy()
    await expect(page.locator(`#${languageListboxId}`)).toBeVisible()
    await expect(languagePicker).toHaveAttribute('aria-activedescendant', /-option-0$/)

    await page.keyboard.press('ArrowDown')
    await expect(languagePicker).toHaveAttribute('aria-activedescendant', /-option-1$/)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/es\/jobs/)
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

  test('operates dashboard shell menus from the keyboard', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.setViewportSize({ width: 900, height: 844 })
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /Dashboard|Welcome/i })).toBeVisible()

    const moreNav = page.getByRole('button', { name: 'More navigation' })
    await moreNav.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#topbar-more-nav-menu')).toBeVisible()
    await expect(page.locator('#topbar-more-nav-menu').getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('#topbar-more-nav-menu').getByRole('menuitem').nth(1)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('#topbar-more-nav-menu')).toHaveCount(0)
    await expect(moreNav).toBeFocused()

    const moreActions = page.getByRole('button', { name: 'More actions' })
    await moreActions.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#topbar-more-actions-menu')).toBeVisible()
    await expect(page.locator('#topbar-more-actions-menu').getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('#topbar-more-actions-menu')).toHaveCount(0)
    await expect(moreActions).toBeFocused()

    const accountMenu = page.getByRole('button', { name: 'Account menu' })
    await accountMenu.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#topbar-user-menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#topbar-user-menu')).toHaveCount(0)
    await expect(accountMenu).toBeFocused()
  })
})
