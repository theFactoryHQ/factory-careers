import { test, expect } from '../fixtures'
import {
  createApplication,
  createCandidate,
  createJob,
} from '../helpers/recruiting-fixtures'

test('primary dashboard lists paginate and filter across complete result sets', async ({
  authenticatedPage: page,
}, testInfo) => {
  test.setTimeout(120_000)

  const runId = `${Date.now()}-${testInfo.workerIndex}`
  const primaryJob = await createJob(page.request, `Pagination Primary ${runId}`)
  const rareJob = await createJob(page.request, `Pagination Rare ${runId}`)

  for (let index = 1; index <= 22; index += 1) {
    const padded = String(index).padStart(2, '0')
    const seededCandidate = await createCandidate(page.request, {
      firstName: `Pagination${padded}`,
      lastName: 'Candidate',
      email: `pagination-${runId}-${padded}@test.local`,
    })
    await createApplication(page.request, {
      candidateId: seededCandidate.id,
      jobId: index === 1 ? rareJob.id : primaryJob.id,
      notes: `Pagination fixture ${padded}`,
    })
  }

  const candidatePageTwoResponse = await page.request.get(
    '/api/candidates?page=2&limit=20&sortBy=created&sortDir=desc',
  )
  expect(candidatePageTwoResponse.ok()).toBe(true)
  const candidatePageTwo = await candidatePageTwoResponse.json() as {
    data: Array<{ firstName: string, lastName: string }>
  }
  const candidateSearchTarget = candidatePageTwo.data[0]!
  await page.waitForLoadState('networkidle')
  const pageErrors: Array<{ route: string, message: string }> = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const source = message.location().url
    pageErrors.push({
      route: new URL(page.url()).pathname,
      message: `console${source ? ` (${source})` : ''}: ${message.text()}`,
    })
  })
  page.on('pageerror', error => pageErrors.push({
    route: new URL(page.url()).pathname,
    message: `pageerror: ${error.message}`,
  }))

  await page.goto('/dashboard/candidates')
  await page.waitForLoadState('networkidle')

  const firstCandidateOnPageOne = await page.locator('tbody .ui-table-row').first().innerText()
  await expect(page.getByText('Showing 1–20 of 22 candidates', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Previous candidates page' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next candidates page' })).toBeEnabled()

  await page.getByRole('button', { name: 'Next candidates page' }).click()
  await expect(page.getByText('Showing 21–22 of 22 candidates', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next candidates page' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Previous candidates page' })).toBeEnabled()
  await expect(page.locator('tbody .ui-table-row').first()).not.toHaveText(firstCandidateOnPageOne)
  await expect(page.locator('tbody')).toContainText(candidateSearchTarget.firstName)
  await page.screenshot({
    path: testInfo.outputPath('candidates-page-two.png'),
    fullPage: true,
  })

  await page.getByLabel('Search candidates').fill(candidateSearchTarget.firstName)
  await expect(page.getByText('Showing 1–1 of 1 candidates', { exact: true })).toBeVisible()
  await expect(page.locator('tbody')).toContainText(candidateSearchTarget.firstName)

  await page.getByLabel('Search candidates').fill('')
  await expect(page.getByText('Showing 1–20 of 22 candidates', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next candidates page' }).click()
  await expect(page.getByText('Showing 21–22 of 22 candidates', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Sort by name/ }).click()
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible()

  const applicationPageTwoResponse = await page.request.get(
    '/api/applications?page=2&limit=20&sortBy=created&sortDir=desc',
  )
  expect(applicationPageTwoResponse.ok()).toBe(true)
  const applicationPageTwo = await applicationPageTwoResponse.json() as {
    data: Array<{
      candidateFirstName: string
      candidateLastName: string
      jobId: string
      jobTitle: string
    }>
  }
  const applicationSearchTarget = applicationPageTwo.data[0]!
  expect(applicationPageTwo.data.some(application => application.jobId === rareJob.id)).toBe(true)

  await page.goto('/dashboard/applications')
  await page.waitForLoadState('networkidle')

  const firstApplicationOnPageOne = await page.locator('tbody .ui-table-row').first().innerText()
  await expect(page.getByText('Showing 1–20 of 22 applications', { exact: true })).toBeVisible()
  await expect(page.locator('tbody')).not.toContainText(rareJob.title)
  await expect(page.getByRole('button', { name: 'Previous applications page' })).toBeDisabled()

  await page.getByRole('button', { name: 'Next applications page' }).click()
  await expect(page.getByText('Showing 21–22 of 22 applications', { exact: true })).toBeVisible()
  await expect(page.locator('tbody .ui-table-row').first()).not.toHaveText(firstApplicationOnPageOne)
  await expect(page.locator('tbody')).toContainText(applicationSearchTarget.candidateFirstName)
  await expect(page.locator('tbody')).toContainText(rareJob.title)

  await page.getByLabel('Search applications').fill('ab')
  await expect(page.getByText(
    'Enter at least 3 characters to search applications',
    { exact: true },
  )).toBeVisible()

  await page.getByLabel('Search applications').fill(applicationSearchTarget.candidateFirstName)
  await expect(page.getByText('Showing 1–1 of 1 applications', { exact: true })).toBeVisible()
  await expect(page.locator('tbody')).toContainText(applicationSearchTarget.candidateFirstName)

  await page.getByLabel('Search applications').fill('')
  await expect(page.getByText('Showing 1–20 of 22 applications', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next applications page' }).click()
  await expect(page.getByText('Showing 21–22 of 22 applications', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /Filters/ }).click()
  const filterDialog = page.getByRole('dialog', { name: 'Filter applications' })
  await expect(filterDialog).toBeVisible()
  const jobFilter = filterDialog
    .locator('.factory-filter-section')
    .filter({ has: page.getByText('Job', { exact: true }) })
  await jobFilter.locator('button.factory-filter-select').click()
  await page.getByRole('option', { name: rareJob.title, exact: true }).click()
  await filterDialog.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(filterDialog).toBeHidden()

  await expect(page.getByText('Showing 1–1 of 1 applications', { exact: true })).toBeVisible()
  await expect(page.locator('tbody')).toContainText(rareJob.title)
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  const pagination = page.getByRole('navigation', { name: 'applications pagination' })
  await expect(pagination).toBeVisible()
  await pagination.scrollIntoViewIfNeeded()
  const paginationBox = await pagination.boundingBox()
  expect(paginationBox).not.toBeNull()
  expect(paginationBox!.x).toBeGreaterThanOrEqual(0)
  expect(paginationBox!.x + paginationBox!.width).toBeLessThanOrEqual(390)
  const paginationIsUnobscured = await pagination.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    )
    return hit === element || (hit != null && element.contains(hit))
  })
  expect(paginationIsUnobscured).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('applications-pagination-mobile.png'),
    fullPage: true,
  })

  const knownHydrationBaseline = 'Hydration completed but contains mismatches.'
  const unexpectedPageErrors = pageErrors.filter(
    error => !error.message.endsWith(knownHydrationBaseline),
  )
  const hydrationRoutes = pageErrors
    .filter(error => error.message.endsWith(knownHydrationBaseline))
    .map(error => error.route)
  expect(unexpectedPageErrors, pageErrors.map(error => error.message).join('\n')).toEqual([])
  expect(hydrationRoutes).toEqual([
    '/dashboard/candidates',
    '/dashboard/applications',
  ])
})
