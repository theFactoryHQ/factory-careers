import type { Browser, Page } from '@playwright/test'
import { test, expect } from '../fixtures'

type CandidateFixture = {
  id: string
  firstName: string
  lastName: string
  email: string
}

type PropertyFixture = {
  id: string
  name: string
}

type PropertyEntry = {
  definition: { id: string, name: string }
  value: unknown
}

async function createCandidate(
  page: Page,
  candidate: Omit<CandidateFixture, 'id'>,
): Promise<CandidateFixture> {
  const response = await page.request.post('/api/candidates', { data: candidate })

  expect(response.status(), `Create candidate API returned ${response.status()}`).toBe(201)
  return await response.json() as CandidateFixture
}

async function setCandidatePropertyValue(
  page: Page,
  candidateId: string,
  propertyId: string,
  value: unknown,
) {
  const response = await page.request.put(`/api/candidates/${candidateId}/properties/${propertyId}`, {
    data: { value },
  })

  expect(response.status(), `Set candidate property value API returned ${response.status()}`).toBe(200)
}

async function expectCandidatePropertyValue(
  page: Page,
  candidateId: string,
  propertyId: string,
  expected: unknown,
) {
  const response = await page.request.get(`/api/candidates/${candidateId}`)
  expect(response.status(), `Candidate detail API returned ${response.status()}`).toBe(200)
  const candidate = await response.json() as { properties: PropertyEntry[] }
  const entry = candidate.properties.find(property => property.definition.id === propertyId)
  expect(entry, `Candidate detail should include property ${propertyId}`).toBeTruthy()
  expect(entry?.value).toEqual(expected)
}

async function createCandidateTextPropertyFromDetail(page: Page, candidateId: string, name: string) {
  await page.goto(`/dashboard/candidates/${candidateId}`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Add org-wide property' }).click()

  const editor = page.getByRole('complementary').filter({ hasText: 'Organization candidate properties' })
  await expect(editor).toBeVisible({ timeout: 15_000 })
  await editor.getByRole('button', { name: 'Add property' }).click()
  await editor.getByRole('textbox').first().fill(name)

  const [createResponse] = await Promise.all([
    page.waitForResponse(
      resp => resp.url().includes('/api/properties') && resp.request().method() === 'POST',
      { timeout: 30_000 },
    ),
    editor.getByRole('button', { name: 'Create' }).click(),
  ])
  expect(createResponse.status(), `Create candidate property API returned ${createResponse.status()}`).toBe(200)
  const property = await createResponse.json() as PropertyFixture
  expect(property.id, 'candidate property id must be present').toBeTruthy()
  expect(property.name).toBe(name)

  await expect(editor).toBeHidden({ timeout: 10_000 })
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 })

  return property
}

async function showPropertyColumn(page: Page, propertyName: string) {
  await page.getByRole('button', { name: /Columns/ }).click()
  const menu = page.getByText('Toggle columns', { exact: true }).locator('..')
  const toggle = menu.getByRole('button', { name: propertyName, exact: true })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(page.getByRole('columnheader', { name: propertyName })).toBeVisible()
  await page.getByRole('heading', { name: 'Candidates' }).click()
}

async function setCandidatePropertyFromTable(page: Page, candidateEmail: string, nextValue: string) {
  const row = page.getByRole('row').filter({ hasText: candidateEmail })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.getByRole('button', { name: 'Empty' }).click()
  const input = row.locator('input.ui-field')
  await expect(input).toBeVisible()

  const [saveResponse] = await Promise.all([
    page.waitForResponse(
      resp => resp.url().includes('/api/candidates/') && resp.url().includes('/properties/') && resp.request().method() === 'PUT',
      { timeout: 30_000 },
    ),
    input.fill(nextValue).then(() => input.press('Enter')),
  ])
  expect(saveResponse.status(), `Candidate property save API returned ${saveResponse.status()}`).toBe(200)
  await expect(row).toContainText(nextValue)
}

async function signUpWithOrganization(browser: Browser, baseURL: string, account: {
  name: string
  email: string
  password: string
  orgName: string
}) {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()

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

  return { context, page }
}

test.describe('Candidate custom properties', () => {
  test('creates, persists, renders, filters, and scopes candidate property values', async ({ authenticatedPage, browser }, testInfo) => {
    const page = authenticatedPage
    const runId = `${Date.now()}-r${testInfo.retry}`
    const matchedCandidate = await createCandidate(page, {
      firstName: 'Casey',
      lastName: `Candidate Property ${runId}`,
      email: `casey.candidate.property.${runId}@example.com`,
    })
    const otherCandidate = await createCandidate(page, {
      firstName: 'Morgan',
      lastName: `Candidate Property ${runId}`,
      email: `morgan.candidate.property.${runId}@example.com`,
    })

    const property = await createCandidateTextPropertyFromDetail(
      page,
      matchedCandidate.id,
      `Candidate signal ${runId}`,
    )

    await page.goto('/dashboard/candidates')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Candidates' })).toBeVisible()
    await showPropertyColumn(page, property.name)
    await setCandidatePropertyFromTable(page, matchedCandidate.email, 'Portfolio reviewed')
    await setCandidatePropertyValue(page, otherCandidate.id, property.id, 'Needs discovery')

    await expectCandidatePropertyValue(page, matchedCandidate.id, property.id, 'Portfolio reviewed')
    await expectCandidatePropertyValue(page, otherCandidate.id, property.id, 'Needs discovery')

    await page.reload()
    await page.waitForLoadState('networkidle')
    const reloadedRow = page.getByRole('row').filter({ hasText: matchedCandidate.email })
    await expect(reloadedRow).toBeVisible()
    await expect(reloadedRow).toContainText('Portfolio reviewed')

    await page.goto(`/dashboard/candidates/${matchedCandidate.id}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: `${matchedCandidate.firstName} ${matchedCandidate.lastName}` })).toBeVisible()
    const propertiesPanel = page.locator('.ui-panel').filter({ hasText: 'Properties' })
    await expect(propertiesPanel).toContainText(property.name)
    await expect(propertiesPanel).toContainText('Portfolio reviewed')

    await page.goto('/dashboard/candidates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /Filters/ }).click()
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    await page.getByRole('button', { name: new RegExp(property.name) }).click()
    await page.getByRole('button', { name: new RegExp(`Edit filter: ${property.name} contains`) }).click()
    await page.getByPlaceholder('Value').fill('Portfolio')
    await page.getByRole('heading', { name: 'Filter candidates' }).click()
    await expect(page.getByRole('row').filter({ hasText: matchedCandidate.email })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('row').filter({ hasText: otherCandidate.email })).toHaveCount(0)

    const baseURL = testInfo.project.use.baseURL as string
    const isolated = await signUpWithOrganization(browser, baseURL, {
      name: `Property Scope ${runId}`,
      email: `property.scope.${runId}@test.local`,
      password: process.env.E2E_TEST_PASSWORD || 'TestPassword123!',
      orgName: `Property Scope Org ${runId}`,
    })
    try {
      const propertiesResponse = await isolated.page.request.get('/api/properties?entityType=candidate')
      expect(propertiesResponse.status(), `Other-org properties API returned ${propertiesResponse.status()}`).toBe(200)
      const properties = await propertiesResponse.json() as PropertyFixture[]
      expect(properties.map(item => item.name)).not.toContain(property.name)
    }
    finally {
      await isolated.context.close()
    }
  })
})
