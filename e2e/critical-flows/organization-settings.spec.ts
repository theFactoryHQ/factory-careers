import { test, expect, selectFactorySelectOption } from '../fixtures'

test.describe('Organization settings safety', () => {
  test('persists profile and localization settings while integrations stay safe when unconfigured', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const baseURL = String(testInfo.project.use.baseURL ?? '')
    expect(baseURL, 'Settings E2E must run against a local Playwright webServer').toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/)

    const unique = `${Date.now()}-r${testInfo.retry}`
    const updatedDisplayName = `Settings Owner ${unique}`

    await page.goto('/dashboard/settings/account')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 15_000 })

    await page.getByLabel('Display name').fill(updatedDisplayName)
    const [profileResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/auth/update-user') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Save profile' }).click(),
    ])
    expect(profileResponse.status(), `Profile update returned ${profileResponse.status()}`).toBe(200)

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByLabel('Display name')).toHaveValue(updatedDisplayName)

    await page.goto('/dashboard/settings/localization')
    await expect(page.getByRole('heading', { name: 'Localization' })).toBeVisible({ timeout: 15_000 })

    const [nameFormatResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/org-settings') && resp.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      selectFactorySelectOption(page, 'Name display format', 'Last First - Doe Jane'),
    ])
    expect(nameFormatResponse.status(), `Name format update returned ${nameFormatResponse.status()}`).toBe(200)

    const [dateFormatResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/org-settings') && resp.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      selectFactorySelectOption(page, 'Date format', 'YYYY-MM-DD - ISO 8601 / East Asia'),
    ])
    expect(dateFormatResponse.status(), `Date format update returned ${dateFormatResponse.status()}`).toBe(200)

    await expect(page.getByText('Doe Jane', { exact: true })).toBeVisible()
    await expect(page.getByText('1990-05-24', { exact: true })).toBeVisible()

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByLabel('Name display format')).toContainText('Last First - Doe Jane')
    await expect(page.getByLabel('Date format')).toContainText('YYYY-MM-DD - ISO 8601 / East Asia')

    const settingsResponse = await page.request.get('/api/org-settings')
    expect(settingsResponse.status(), `Org settings read returned ${settingsResponse.status()}`).toBe(200)
    await expect(settingsResponse).toBeOK()
    const settings = await settingsResponse.json() as { nameDisplayFormat: string; dateFormat: string }
    expect(settings).toMatchObject({
      nameDisplayFormat: 'last_first',
      dateFormat: 'ymd',
    })

    await page.goto('/dashboard/settings/integrations', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible()
    await expect(page.getByText('Not configured')).toBeVisible()
    await expect(page.getByText('Microsoft Calendar integration requires server configuration.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connect shared calendar' })).toHaveCount(0)

    const calendarStatusResponse = await page.request.get('/api/calendar/status')
    expect(calendarStatusResponse.status(), `Calendar status returned ${calendarStatusResponse.status()}`).toBe(200)
    const calendarStatus = await calendarStatusResponse.json() as { available: boolean; connected: boolean }
    expect(calendarStatus).toMatchObject({
      available: false,
      connected: false,
    })
  })
})
