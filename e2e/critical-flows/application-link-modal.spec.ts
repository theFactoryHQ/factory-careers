import { test, expect } from '../fixtures'
import {
  createApplication,
  createCandidate,
  createJob,
  publishJob,
} from '../helpers/recruiting-fixtures'

test.describe('ApplicationLinkModal and detail drawer smoke', () => {
  test('opens apply-to-job modal from candidate drawer and dismisses with Escape', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`
    const job = await createJob(page.request, `E2E Apply Modal ${unique}`)
    await publishJob(page.request, job.id)
    const candidate = await createCandidate(page.request, {
      firstName: 'Apply',
      lastName: 'Modal',
      email: `apply-modal-${unique}@example.com`,
    })

    await page.goto('/dashboard/candidates')
    await page.waitForLoadState('networkidle')

    const row = page.getByRole('row').filter({ hasText: candidate.email })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: /Open candidate Apply Modal/ }).click()

    const drawer = page.getByRole('dialog', { name: 'Candidate detail' })
    await expect(drawer).toBeVisible()

    await drawer.getByRole('button', { name: 'Apply to Job' }).click()
    const modal = page.getByRole('dialog', { name: 'Apply to job' })
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Apply to job' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
    await expect(drawer).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
  })

  test('opens add-candidate modal from job sub-nav and dismisses with Escape', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`
    const job = await createJob(page.request, `E2E Add Candidate ${unique}`)
    await publishJob(page.request, job.id)

    await page.goto(`/dashboard/jobs/${job.id}`)
    await page.waitForLoadState('networkidle')

    await page.locator('#job-sub-nav-actions').getByRole('button', { name: 'Add' }).click()
    const modal = page.getByRole('dialog', { name: 'Add candidate' })
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Add candidate' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
  })

  test('opens application detail drawer from job candidates table and closes with Escape', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`
    const job = await createJob(page.request, `E2E Application Drawer ${unique}`)
    const candidate = await createCandidate(page.request, {
      firstName: 'Drawer',
      lastName: 'Candidate',
      email: `application-drawer-${unique}@example.com`,
    })
    await createApplication(page.request, {
      candidateId: candidate.id,
      jobId: job.id,
      notes: 'Application link modal E2E coverage.',
    })

    await page.goto(`/dashboard/jobs/${job.id}/candidates`)
    await page.waitForLoadState('networkidle')

    const row = page.getByRole('row').filter({ hasText: candidate.email })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: /Open application for Drawer Candidate/ }).click()

    const drawer = page.locator('aside[aria-label="Application detail"]')
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
  })
})