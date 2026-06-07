import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import {
  createApplication,
  createCandidate,
  createJob,
} from '../helpers/recruiting-fixtures'

type ApplicationFixture = {
  id: string
}

type PropertyFixture = {
  id: string
  name: string
}

type PropertyEntry = {
  definition: { id: string, name: string }
  value: unknown
}

async function createApplicationTextProperty(page: Page, name: string): Promise<PropertyFixture> {
  const response = await page.request.post('/api/properties', {
    data: {
      entityType: 'application',
      type: 'text',
      name,
      config: null,
    },
  })

  expect(response.status(), `Create text property API returned ${response.status()}`).toBe(200)
  return await response.json() as PropertyFixture
}

async function createApplicationSelectProperty(page: Page, name: string): Promise<PropertyFixture> {
  const response = await page.request.post('/api/properties', {
    data: {
      entityType: 'application',
      type: 'select',
      name,
      config: {
        options: [
          { id: 'high-priority', label: 'High priority', color: 'green' },
          { id: 'needs-follow-up', label: 'Needs follow-up', color: 'amber' },
        ],
      },
    },
  })

  expect(response.status(), `Create select property API returned ${response.status()}`).toBe(200)
  return await response.json() as PropertyFixture
}

async function setApplicationPropertyValue(
  page: Page,
  applicationId: string,
  propertyId: string,
  value: unknown,
) {
  const response = await page.request.put(`/api/applications/${applicationId}/properties/${propertyId}`, {
    data: { value },
  })

  expect(response.status(), `Set property value API returned ${response.status()}`).toBe(200)
}

async function expectApplicationPropertyValue(
  page: Page,
  applicationId: string,
  propertyId: string,
  expected: unknown,
) {
  const response = await page.request.get(`/api/applications/${applicationId}`)
  expect(response.status(), `Application detail API returned ${response.status()}`).toBe(200)
  const application = await response.json() as { properties: PropertyEntry[] }
  const entry = application.properties.find(property => property.definition.id === propertyId)
  expect(entry, `Application detail should include property ${propertyId}`).toBeTruthy()
  expect(entry?.value).toEqual(expected)
}

async function showPropertyColumns(page: Page, propertyNames: string[]) {
  await page.getByRole('button', { name: /Columns/ }).click()
  const menu = page.getByRole('menu', { name: 'Toggle columns' })
  for (const propertyName of propertyNames) {
    const toggle = menu.getByRole('menuitemcheckbox', { name: propertyName, exact: true })
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(page.getByRole('columnheader', { name: propertyName })).toBeVisible()
  }
  await page.getByRole('heading', { name: 'Applications' }).click()
}

test.describe('Application custom properties', () => {
  test('persists text and select values across API reads and dashboard reloads', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const runId = `${Date.now()}-r${testInfo.retry}`
    const candidate = await createCandidate(page.request, {
      firstName: 'Parker',
      lastName: `Property ${runId}`,
      email: `parker.property.${runId}@example.com`,
    })
    const job = await createJob(page.request, `Property Persistence ${runId}`)
    const application = await createApplication(page.request, {
      candidateId: candidate.id,
      jobId: job.id,
    })
    const textProperty = await createApplicationTextProperty(page, `Screening note ${runId}`)
    const selectProperty = await createApplicationSelectProperty(page, `Priority ${runId}`)

    await setApplicationPropertyValue(page, application.id, textProperty.id, 'Portfolio fit confirmed')
    await setApplicationPropertyValue(page, application.id, selectProperty.id, 'high-priority')
    await expectApplicationPropertyValue(page, application.id, textProperty.id, 'Portfolio fit confirmed')
    await expectApplicationPropertyValue(page, application.id, selectProperty.id, 'high-priority')

    await page.goto('/dashboard/applications')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible()
    await showPropertyColumns(page, [textProperty.name, selectProperty.name])

    const applicationRow = page.getByRole('row').filter({ hasText: candidate.email })
    await expect(applicationRow).toBeVisible()
    await expect(applicationRow).toContainText('Portfolio fit confirmed')
    await expect(applicationRow).toContainText('High priority')

    await setApplicationPropertyValue(page, application.id, textProperty.id, 'References need review')
    await setApplicationPropertyValue(page, application.id, selectProperty.id, 'needs-follow-up')
    await expectApplicationPropertyValue(page, application.id, textProperty.id, 'References need review')
    await expectApplicationPropertyValue(page, application.id, selectProperty.id, 'needs-follow-up')

    await page.reload()
    await page.waitForLoadState('networkidle')

    const reloadedRow = page.getByRole('row').filter({ hasText: candidate.email })
    await expect(reloadedRow).toBeVisible()
    await expect(reloadedRow).toContainText('References need review')
    await expect(reloadedRow).toContainText('Needs follow-up')
  })
})
