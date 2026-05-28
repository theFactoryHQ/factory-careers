import { test, expect } from '../fixtures'
import { expectNoA11yViolations, expectVisibleKeyboardFocus, tabUntilFocused } from '../accessibility'

async function createKeyboardCandidate(page: import('@playwright/test').Page, label: string) {
  const unique = `${Date.now()}-${label}`
  const response = await page.request.post('/api/candidates', {
    data: {
      firstName: 'Table',
      lastName: `Keyboard ${label}`,
      email: `table-keyboard-${unique}@example.com`,
      phone: '+15555550123',
    },
  })
  expect(response.status(), `Create keyboard candidate returned ${response.status()}: ${await response.text()}`).toBe(201)
  return await response.json() as { id: string, email: string, firstName: string, lastName: string }
}

async function createKeyboardJobApplication(page: import('@playwright/test').Page, label: string) {
  const candidate = await createKeyboardCandidate(page, `job-${label}`)
  const jobResponse = await page.request.post('/api/jobs', {
    data: {
      title: `Keyboard Table Job ${Date.now()}-${label}`,
      description: 'Seeded by dashboard table keyboard E2E coverage.',
      location: 'Remote',
      type: 'full_time',
      requireResume: false,
      requireCoverLetter: false,
      applicationComplianceEnabled: false,
      autoScoreOnApply: false,
    },
  })
  expect(jobResponse.status(), `Create keyboard job returned ${jobResponse.status()}: ${await jobResponse.text()}`).toBe(201)
  const job = await jobResponse.json() as { id: string, title: string }

  const applicationResponse = await page.request.post('/api/applications', {
    data: {
      candidateId: candidate.id,
      jobId: job.id,
      notes: 'Keyboard table coverage application.',
    },
  })
  expect(applicationResponse.status(), `Create keyboard application returned ${applicationResponse.status()}: ${await applicationResponse.text()}`).toBe(201)
  return { candidate, job }
}

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

  test('traps and restores focus in dashboard filter drawers', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/dashboard/applications')
    await page.waitForLoadState('networkidle')

    const filtersButton = page.getByRole('button', { name: /^Filters/ })
    await filtersButton.focus()
    await page.keyboard.press('Enter')

    const drawer = page.getByRole('dialog', { name: 'Filter applications' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Close' })).toBeFocused()

    await page.keyboard.press('Shift+Tab')
    await expect(drawer.getByRole('button', { name: 'Done' })).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(filtersButton).toBeFocused()
  })

  test('opens candidate table rows and sort headers from the keyboard', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const candidate = await createKeyboardCandidate(page, `pool-${testInfo.retry}`)

    await page.goto('/dashboard/candidates')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Candidates' })).toBeVisible()

    await page.getByLabel('Search candidates').fill(candidate.email)
    const row = page.getByRole('row').filter({ hasText: candidate.email })
    await expect(row).toBeVisible()

    const nameHeader = page.getByRole('columnheader').filter({ hasText: 'Name' })
    await expect(nameHeader).toHaveAttribute('aria-sort', 'none')
    const nameSort = page.getByRole('button', { name: 'Sort by name' })
    await nameSort.focus()
    await expectVisibleKeyboardFocus(nameSort)
    await page.keyboard.press('Enter')
    await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')

    const openCandidate = row.getByRole('button', { name: /Open candidate Table Keyboard/ })
    await openCandidate.focus()
    await expectVisibleKeyboardFocus(openCandidate)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Candidate detail' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Candidate detail' })).toHaveCount(0)

    const addNotes = row.getByRole('button', { name: 'Add Notes' })
    await addNotes.focus()
    await expectVisibleKeyboardFocus(addNotes)
    await page.keyboard.press('Enter')
    await expect(row.getByRole('textbox')).toBeFocused()
  })

  test('opens job candidate table rows from keyboard controls', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const { candidate, job } = await createKeyboardJobApplication(page, `${testInfo.retry}`)

    await page.goto(`/dashboard/jobs/${job.id}/candidates`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(job.title).first()).toBeVisible()

    const row = page.getByRole('row').filter({ hasText: candidate.email })
    await expect(row).toBeVisible()

    const scoreHeader = page.getByRole('columnheader').filter({ hasText: 'Score' })
    await expect(scoreHeader).toHaveAttribute('aria-sort', 'descending')
    const scoreSort = page.getByRole('button', { name: 'Sort by score ascending' })
    await scoreSort.focus()
    await expectVisibleKeyboardFocus(scoreSort)
    await page.keyboard.press('Enter')
    await expect(scoreHeader).toHaveAttribute('aria-sort', 'ascending')

    const openApplication = row.getByRole('button', { name: /Open application for Table Keyboard/ })
    await openApplication.focus()
    await expectVisibleKeyboardFocus(openApplication)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Candidate detail' })).toBeVisible()
  })
})
