import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import {
  createApplication,
  createCandidate,
  createJob,
  updateApplicationStatus,
} from '../helpers/recruiting-fixtures'

async function seedApplications(page: Page, runId: string) {
  const primaryJob = await createJob(page.request, `Saved View Product ${runId}`)
  const secondaryJob = await createJob(page.request, `Saved View Support ${runId}`)

  const matchingCandidate = await createCandidate(page.request, {
    firstName: 'Alice',
    lastName: `Match ${runId}`,
    email: `alice.match.${runId}@example.com`,
  })
  const sameJobNewCandidate = await createCandidate(page.request, {
    firstName: 'Brennan',
    lastName: `New ${runId}`,
    email: `brennan.new.${runId}@example.com`,
  })
  const otherJobCandidate = await createCandidate(page.request, {
    firstName: 'Casey',
    lastName: `Other ${runId}`,
    email: `casey.other.${runId}@example.com`,
  })

  const matchingApplication = await createApplication(page.request, {
    candidateId: matchingCandidate.id,
    jobId: primaryJob.id,
  })
  await createApplication(page.request, {
    candidateId: sameJobNewCandidate.id,
    jobId: primaryJob.id,
  })
  const otherJobApplication = await createApplication(page.request, {
    candidateId: otherJobCandidate.id,
    jobId: secondaryJob.id,
  })

  await updateApplicationStatus(page.request, matchingApplication.id, 'screening')
  await updateApplicationStatus(page.request, otherJobApplication.id, 'screening')

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
    const columnsPanel = page.getByRole('menu', { name: 'Toggle columns' })
    await columnsPanel.getByRole('menuitemcheckbox', { name: 'Email', exact: true }).click()
    await expect(page.getByRole('columnheader', { name: 'Email' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Saved views' }).click()
    await page.getByRole('menuitem', { name: 'Save current view' }).click()
    await page.getByPlaceholder('View name').fill(viewName)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Saved views' })).toContainText(viewName)

    await page.getByRole('button', { name: 'Saved views' }).click()
    await page.getByRole('menuitem', { name: new RegExp(viewName) }).click()
    const viewRow = page.locator('.factory-saved-views-row').filter({ hasText: viewName })
    await page.getByRole('button', { name: 'Saved views' }).click()
    await viewRow.hover()
    await viewRow.getByTitle('Set as default').click()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: /Clear/ }).click()
    await expect(page.getByRole('row').filter({ hasText: sameJobNewCandidateName })).toBeVisible()

    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: 'Saved views' })).toContainText(viewName)
    await expect(page.getByRole('row').filter({ hasText: matchingCandidateName })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: sameJobNewCandidateName })).toHaveCount(0)
    await expect(page.getByRole('row').filter({ hasText: otherJobCandidateName })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Email' })).toHaveCount(0)
    expect(new URL(page.url()).searchParams.get('status')).toBe('screening')
  })
})
