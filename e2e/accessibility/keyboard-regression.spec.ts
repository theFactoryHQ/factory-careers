import {
  expectFocusRestored,
  expectVisibleFocus,
  openWithKeyboard,
  runAxeScan,
} from '../accessibility'
import { expect, test } from '../fixtures'

test.describe('keyboard regression matrix', () => {
  test('public jobs page keeps search and filters keyboard reachable', async ({ page }) => {
    await page.goto('/jobs')

    const search = page.getByLabel('Search jobs')
    await search.focus()
    await expect(search).toBeFocused()
    await expectVisibleFocus(page)

    await runAxeScan(page)
  })

  test('auth sign-in form is reachable by Tab and passes basic axe checks', async ({ page }) => {
    await page.goto('/auth/sign-in')

    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
    await expectVisibleFocus(page)

    await runAxeScan(page)
  })

  test('dashboard shell menus open and close from the keyboard', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard')

    const more = page.getByRole('button', { name: 'More' }).first()
    await openWithKeyboard(page, more)
    await expect(page.getByRole('menu')).toBeVisible()
    await expectFocusRestored(page, more)

    await runAxeScan(page)
  })
})
