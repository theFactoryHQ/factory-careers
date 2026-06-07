import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import {
  createApplication,
  createCandidate,
  createJob,
  updateApplicationStatus,
} from '../helpers/recruiting-fixtures'

const JOB_TITLE = 'Application Board Test Job'

async function seedApplicationBoard(page: Page, retry: number) {
  const unique = `${Date.now()}-${retry}`
  const job = await createJob(page.request, `${JOB_TITLE} ${unique}`)
  const primaryCandidate = await createCandidate(page.request, {
    firstName: 'Board',
    lastName: 'Primary',
    email: `board-primary-${unique}@example.com`,
  })
  const secondaryCandidate = await createCandidate(page.request, {
    firstName: 'Board',
    lastName: 'Filtered',
    email: `board-filtered-${unique}@example.com`,
  })

  const primaryApplication = await createApplication(page.request, {
    candidateId: primaryCandidate.id,
    jobId: job.id,
    notes: 'Initial board note for the primary candidate.',
  })
  const secondaryApplication = await createApplication(page.request, {
    candidateId: secondaryCandidate.id,
    jobId: job.id,
    notes: 'Screened candidate used by the status filter.',
  })
  await updateApplicationStatus(page.request, secondaryApplication.id, 'screening')

  return { job, primaryCandidate, secondaryCandidate, primaryApplication, secondaryApplication }
}

test.describe('Application board management', () => {
  test('filters, persists stage changes, and records comment activity quickly', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const {
      job,
      primaryCandidate,
      secondaryCandidate,
      primaryApplication,
      secondaryApplication,
    } = await seedApplicationBoard(page, testInfo.retry)

    await page.goto('/dashboard/applications')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible()

    const primaryRow = page.getByRole('row').filter({ hasText: primaryCandidate.email })
    const secondaryRow = page.getByRole('row').filter({ hasText: secondaryCandidate.email })
    await expect(primaryRow).toBeVisible()
    await expect(secondaryRow).toBeVisible()

    const applicationSearch = page.getByLabel('Search applications')
    await applicationSearch.click()
    await applicationSearch.pressSequentially(primaryCandidate.email)
    await expect(applicationSearch).toHaveValue(primaryCandidate.email)
    await expect(primaryRow).toBeVisible()
    await expect(secondaryRow).toHaveCount(0)

    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(secondaryRow).toBeVisible()

    await page.getByRole('button', { name: /^Filters/ }).click()
    await page.getByRole('button', { name: 'Screening' }).click()
    await expect(secondaryRow).toBeVisible()
    await expect(primaryRow).toHaveCount(0)

    await page.getByRole('dialog', { name: 'Filter applications' }).getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(primaryRow).toBeVisible()

    await primaryRow.getByRole('button', { name: 'Board Primary' }).click()
    const drawer = page.locator('aside[aria-label="Application detail"]')
    await expect(drawer.getByRole('heading', { name: 'Board Primary' })).toBeVisible()

    const [statusResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().endsWith(`/api/applications/${primaryApplication.id}`) && resp.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      drawer.getByRole('button', { name: 'Screening' }).click(),
    ])
    expect(statusResponse.status(), `Status PATCH returned ${statusResponse.status()}`).toBe(200)
    await expect(drawer).toContainText('Screening')

    const applicationListResponse = await page.request.get(`/api/applications?jobId=${job.id}&status=screening`)
    expect(applicationListResponse.status(), `Applications API returned ${applicationListResponse.status()}`).toBe(200)
    const applicationList = await applicationListResponse.json() as { data: ApplicationRecord[] }
    expect(applicationList.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: primaryApplication.id, status: 'screening', candidateEmail: primaryCandidate.email }),
      expect.objectContaining({ id: secondaryApplication.id, status: 'screening', candidateEmail: secondaryCandidate.email }),
    ]))

    const commentResponse = await page.request.post('/api/comments', {
      data: {
        targetType: 'application',
        targetId: primaryApplication.id,
        body: 'Board follow-up comment from E2E.',
      },
    })
    expect(commentResponse.status(), `Create comment API returned ${commentResponse.status()}: ${await commentResponse.text()}`).toBe(201)
    const comment = await commentResponse.json() as { id: string, body: string }
    expect(comment.body).toBe('Board follow-up comment from E2E.')

    const updatedCommentResponse = await page.request.patch(`/api/comments/${comment.id}`, {
      data: { body: 'Updated board follow-up comment from E2E.' },
    })
    expect(updatedCommentResponse.status(), `Update comment API returned ${updatedCommentResponse.status()}: ${await updatedCommentResponse.text()}`).toBe(200)
    await expect
      .poll(async () => {
        const response = await page.request.get(`/api/comments?targetType=application&targetId=${primaryApplication.id}`)
        expect(response.status(), `Comments API returned ${response.status()}`).toBe(200)
        const body = await response.json() as { data: Array<{ id: string, body: string }> }
        return body.data.find(item => item.id === comment.id)?.body
      })
      .toBe('Updated board follow-up comment from E2E.')

    const deleteCommentResponse = await page.request.delete(`/api/comments/${comment.id}`)
    expect(deleteCommentResponse.status(), `Delete comment API returned ${deleteCommentResponse.status()}`).toBe(204)
    await expect
      .poll(async () => {
        const response = await page.request.get(`/api/comments?targetType=application&targetId=${primaryApplication.id}`)
        expect(response.status(), `Comments API returned ${response.status()}`).toBe(200)
        const body = await response.json() as { data: Array<{ id: string }> }
        return body.data.some(item => item.id === comment.id)
      })
      .toBe(false)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible()
    await page.getByLabel('Search applications').fill(primaryCandidate.email)
    const reloadedPrimaryRow = page.getByRole('row').filter({ hasText: primaryCandidate.email })
    await expect(reloadedPrimaryRow).toBeVisible()
    await expect(reloadedPrimaryRow).toContainText('Screening')

    await page.goto('/dashboard/timeline')
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible()
    await page.getByLabel('Search timeline').fill('Board Primary')
    await expect(page.getByText('Comment added to application')).toBeVisible()
    await expect(page.getByRole('link', { name: /Application moved\s+Board Primary/ })).toBeVisible()
  })
})
