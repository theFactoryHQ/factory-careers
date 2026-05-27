import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'

type JobFixture = {
  id: string
  title: string
}

type CandidateFixture = {
  id: string
  firstName: string
  lastName: string
  email: string
}

type ApplicationFixture = {
  id: string
  status: string
}

async function createJob(page: Page, title: string): Promise<JobFixture> {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: `E2E fixture for ${title}`,
      location: 'Remote',
      type: 'full_time',
      requireResume: false,
      requireCoverLetter: false,
      applicationComplianceEnabled: false,
      autoScoreOnApply: false,
    },
  })

  expect(response.status(), `Create job API returned ${response.status()}`).toBe(201)
  return await response.json() as JobFixture
}

async function createCandidate(
  page: Page,
  candidate: Omit<CandidateFixture, 'id'>,
): Promise<CandidateFixture> {
  const response = await page.request.post('/api/candidates', { data: candidate })

  expect(response.status(), `Create candidate API returned ${response.status()}`).toBe(201)
  return await response.json() as CandidateFixture
}

async function createApplication(
  page: Page,
  candidateId: string,
  jobId: string,
): Promise<ApplicationFixture> {
  const response = await page.request.post('/api/applications', {
    data: { candidateId, jobId },
  })

  expect(response.status(), `Create application API returned ${response.status()}`).toBe(201)
  return await response.json() as ApplicationFixture
}

async function moveApplicationToScreening(page: Page, applicationId: string) {
  const response = await page.request.patch(`/api/applications/${applicationId}`, {
    data: { status: 'screening' },
  })

  expect(response.status(), `Application status API returned ${response.status()}`).toBe(200)
  const updated = await response.json() as ApplicationFixture
  expect(updated.status).toBe('screening')
}

async function seedApplications(page: Page, runId: string) {
  const primaryJob = await createJob(page, `Saved View Product ${runId}`)
  const secondaryJob = await createJob(page, `Saved View Support ${runId}`)

  const matchingCandidate = await createCandidate(page, {
    firstName: 'Alice',
    lastName: `Match ${runId}`,
    email: `alice.match.${runId}@example.com`,
  })
  const sameJobNewCandidate = await createCandidate(page, {
    firstName: 'Brennan',
    lastName: `New ${runId}`,
    email: `brennan.new.${runId}@example.com`,
  })
  const otherJobCandidate = await createCandidate(page, {
    firstName: 'Casey',
    lastName: `Other ${runId}`,
    email: `casey.other.${runId}@example.com`,
  })

  const matchingApplication = await createApplication(page, matchingCandidate.id, primaryJob.id)
  await createApplication(page, sameJobNewCandidate.id, primaryJob.id)
  const otherJobApplication = await createApplication(page, otherJobCandidate.id, secondaryJob.id)

  await moveApplicationToScreening(page, matchingApplication.id)
  await moveApplicationToScreening(page, otherJobApplication.id)

  return {
    primaryJob,
    matchingCandidate,
    sameJobNewCandidate,
    otherJobCandidate,
  }
}

async function openFilters(page: Page) {
  await page.getByRole('button', { name: /Filters/ }).click()
  const drawer = page.getByRole('dialog', { name: 'Filter applications' })
  await expect(drawer).toBeVisible()
  return drawer
}

test.describe('Application table saved views', () => {
  test('restores status, job, and column settings from a saved view', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const runId = `${Date.now()}-r${testInfo.retry}`
    const viewName = `Screening product ${runId}`
    const {
      primaryJob,
      matchingCandidate,
      sameJobNewCandidate,
      otherJobCandidate,
    } = await seedApplications(page, runId)
    const matchingCandidateName = `${matchingCandidate.firstName} ${matchingCandidate.lastName}`
    const sameJobNewCandidateName = `${sameJobNewCandidate.firstName} ${sameJobNewCandidate.lastName}`
    const otherJobCandidateName = `${otherJobCandidate.firstName} ${otherJobCandidate.lastName}`

    await page.goto('/dashboard/applications')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: matchingCandidate.email })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: sameJobNewCandidate.email })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: otherJobCandidate.email })).toBeVisible()

    const drawer = await openFilters(page)
    await drawer.getByRole('button', { name: 'Screening' }).click()
    await drawer.getByRole('button', { name: 'All jobs' }).click()
    await page.getByRole('option', { name: primaryJob.title, exact: true }).click()
    await drawer.getByRole('button', { name: 'Done' }).click()

    await expect(page.getByRole('row').filter({ hasText: matchingCandidate.email })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: sameJobNewCandidate.email })).toHaveCount(0)
    await expect(page.getByRole('row').filter({ hasText: otherJobCandidate.email })).toHaveCount(0)

    await page.getByRole('button', { name: /Columns/ }).click()
    const columnsPanel = page.getByText('Toggle columns', { exact: true }).locator('..')
    await columnsPanel.getByRole('button', { name: 'Email', exact: true }).click()
    await expect(page.getByRole('columnheader', { name: 'Email' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Views' }).click()
    await page.getByRole('button', { name: 'Save current view' }).click()
    await page.getByPlaceholder('View name').fill(viewName)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: new RegExp(viewName) })).toBeVisible()

    await page.getByRole('button', { name: new RegExp(viewName) }).click()
    const viewRow = page.locator('.factory-saved-views-row').filter({ hasText: viewName })
    await viewRow.hover()
    await viewRow.getByTitle('Set as default').click()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: /Clear/ }).click()
    await expect(page.getByRole('row').filter({ hasText: sameJobNewCandidateName })).toBeVisible()

    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: new RegExp(viewName) })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: matchingCandidateName })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: sameJobNewCandidateName })).toHaveCount(0)
    await expect(page.getByRole('row').filter({ hasText: otherJobCandidateName })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Email' })).toHaveCount(0)
    expect(new URL(page.url()).searchParams.get('status')).toBe('screening')
  })
})
