import type { Browser, Page } from '@playwright/test'
import { assertMutatingE2ESafety } from '../safety'
import { expect, expectFloatingMenuNotClipped, selectFactorySelectOption, test } from '../fixtures'
import {
  lookupJoinRequestStatus,
  lookupMemberByEmail,
  lookupMembership,
} from '../helpers/db'

interface SignedInApplicant {
  email: string
  name: string
  page: Page
  close: () => Promise<void>
}

async function signUpWithoutOrganization(browser: Browser, baseURL: string, label: string): Promise<SignedInApplicant> {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const account = {
    name: `Org Admin ${label} ${id}`,
    email: `org-admin-${label}-${id}@test.local`,
    password: process.env.E2E_TEST_PASSWORD || 'TestPassword123!',
  }

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

    await page.waitForURL('**/onboarding/**', { waitUntil: 'networkidle', timeout: 30_000 })
  }
  else {
    await page.waitForLoadState('networkidle')
  }

  return {
    ...account,
    page,
    close: () => context.close(),
  }
}

async function createJoinRequest(page: Page, organizationId: string, message: string) {
  const response = await page.request.post('/api/join-requests', {
    data: {
      organizationId,
      message,
    },
  })
  expect(response.status(), `Create join request returned ${response.status()}`).toBe(201)
  return await response.json() as { id: string, status: string, organizationName: string }
}

test.describe('Organization administration and join requests', () => {
  test('persists org settings, manages join requests, and blocks member-level mutations', async ({ authenticatedPage, testAccount, browser }, testInfo) => {
    const page = authenticatedPage
    const baseURL = String(testInfo.project.use.baseURL ?? '')
    assertMutatingE2ESafety({
      env: {
        PLAYWRIGHT_BASE_URL: baseURL,
        DATABASE_URL: process.env.DATABASE_URL,
      },
    })
    expect(process.env.FACTORY_EMAIL_TEST_MODE, 'Org admin E2E must not use real email delivery').toBe('capture')

    const ownerMembership = await lookupMembership(testAccount.email, testAccount.orgName)
    const unique = `${Date.now()}-r${testInfo.retry}`
    const renamedOrg = `E2E Org Admin ${unique}`
    const approvedApplicant = await signUpWithoutOrganization(browser, baseURL, `approved-${testInfo.workerIndex}`)
    const rejectedApplicant = await signUpWithoutOrganization(browser, baseURL, `rejected-${testInfo.workerIndex}`)

    try {
      await page.goto('/dashboard/settings', { waitUntil: 'networkidle' })
      await expect(page.getByRole('heading', { name: 'General' })).toBeVisible({ timeout: 15_000 })
      await page.getByLabel('Organization name').fill(renamedOrg)
      await selectFactorySelectOption(page, 'Default pay period', 'Per month')

      const [orgUpdateResponse, settingsUpdateResponse] = await Promise.all([
        page.waitForResponse(
          resp => resp.url().includes('/api/auth/organization/update') && resp.request().method() === 'POST',
          { timeout: 30_000 },
        ),
        page.waitForResponse(
          resp => resp.url().includes('/api/org-settings') && resp.request().method() === 'PATCH',
          { timeout: 30_000 },
        ),
        page.getByRole('button', { name: 'Save changes' }).click(),
      ])
      expect(orgUpdateResponse.status(), `Organization update returned ${orgUpdateResponse.status()}`).toBe(200)
      expect(settingsUpdateResponse.status(), `Org settings update returned ${settingsUpdateResponse.status()}`).toBe(200)

      await page.reload({ waitUntil: 'networkidle' })
      await expect(page.getByLabel('Organization name')).toHaveValue(renamedOrg)
      await expect(page.getByLabel('Default pay period')).toContainText('Per month')

      const approvedRequest = await createJoinRequest(
        approvedApplicant.page,
        ownerMembership.organizationId,
        'Please approve me for the org-admin E2E happy path.',
      )
      const rejectedRequest = await createJoinRequest(
        rejectedApplicant.page,
        ownerMembership.organizationId,
        'Please reject me for the org-admin E2E denial path.',
      )

      await page.goto('/dashboard/settings/members', { waitUntil: 'networkidle' })
      await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(approvedApplicant.email)).toBeVisible()
      await expect(page.getByText(rejectedApplicant.email)).toBeVisible()

      const approvedRequestRow = page.locator('.ui-list-row').filter({ hasText: approvedApplicant.email }).first()
      const [approveResponse] = await Promise.all([
        page.waitForResponse(
          resp => resp.url().includes(`/api/join-requests/${approvedRequest.id}/approve`) && resp.request().method() === 'POST',
          { timeout: 30_000 },
        ),
        approvedRequestRow.getByRole('button', { name: 'Approve' }).click(),
      ])
      expect(approveResponse.status(), `Approve join request returned ${approveResponse.status()}`).toBe(200)

      await expect.poll(
        async () => await lookupMemberByEmail(approvedApplicant.email, ownerMembership.organizationId),
        { timeout: 30_000, message: 'approved applicant should become an organization member' },
      ).toMatchObject({ role: 'member' })
      const approvedMember = await lookupMemberByEmail(approvedApplicant.email, ownerMembership.organizationId)
      expect(approvedMember).toBeTruthy()

      const origin = new URL(baseURL).origin
      const setActiveResponse = await approvedApplicant.page.request.post('/api/auth/organization/set-active', {
        headers: { origin },
        data: { organizationId: ownerMembership.organizationId },
      })
      expect(setActiveResponse.status(), `Approved applicant set-active returned ${setActiveResponse.status()}`).toBe(200)

      await approvedApplicant.page.goto('/dashboard/settings/members', { waitUntil: 'networkidle' })
      await expect(approvedApplicant.page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible()
      await expect(approvedApplicant.page.getByText("You don't have permission to manage team members.")).toBeVisible()

      const forbiddenSettingsResponse = await approvedApplicant.page.request.patch('/api/org-settings', {
        data: { defaultSalaryUnit: 'HOUR' },
      })
      expect(forbiddenSettingsResponse.status(), `Member org-settings PATCH returned ${forbiddenSettingsResponse.status()}`).toBe(403)

      const forbiddenJoinRequestResponse = await approvedApplicant.page.request.post(`/api/join-requests/${rejectedRequest.id}/approve`)
      expect(forbiddenJoinRequestResponse.status(), `Member join-request approve returned ${forbiddenJoinRequestResponse.status()}`).toBe(403)

      await page.goto('/dashboard/settings/members', { waitUntil: 'networkidle' })
      const approvedMemberRow = page.locator('.ui-list-row').filter({ hasText: approvedApplicant.email }).first()
      await expect(approvedMemberRow.getByText('Member', { exact: true })).toBeVisible()
      await approvedMemberRow.locator('[data-member-actions] button').click()
      const roleActionsMenu = page.locator('[data-member-role-menu]').filter({ has: page.getByRole('button', { name: 'Make admin' }) })
      await expect(roleActionsMenu).toBeVisible()
      await expectFloatingMenuNotClipped(roleActionsMenu)
      const [roleResponse] = await Promise.all([
        page.waitForResponse(
          resp => resp.url().includes('/api/auth/organization/update-member-role') && resp.request().method() === 'POST',
          { timeout: 30_000 },
        ),
        page.getByRole('button', { name: 'Make admin' }).click(),
      ])
      expect(roleResponse.status(), `Update member role returned ${roleResponse.status()}`).toBe(200)
      await expect(approvedMemberRow.getByText('Admin', { exact: true })).toBeVisible({ timeout: 15_000 })

      const promotedMember = await lookupMemberByEmail(approvedApplicant.email, ownerMembership.organizationId)
      expect(promotedMember).toMatchObject({ role: 'admin' })

      const rejectedRequestRow = page.locator('.ui-list-row').filter({ hasText: rejectedApplicant.email }).first()
      const [rejectResponse] = await Promise.all([
        page.waitForResponse(
          resp => resp.url().includes(`/api/join-requests/${rejectedRequest.id}/reject`) && resp.request().method() === 'POST',
          { timeout: 30_000 },
        ),
        rejectedRequestRow.getByRole('button', { name: 'Reject' }).click(),
      ])
      expect(rejectResponse.status(), `Reject join request returned ${rejectResponse.status()}`).toBe(200)
      await expect(page.getByText(rejectedApplicant.email)).toHaveCount(0)

      const rejectedStatus = await lookupJoinRequestStatus(rejectedRequest.id)
      expect(rejectedStatus).toMatchObject({ status: 'rejected' })
      expect(rejectedStatus?.reviewedAt).toBeTruthy()

      const rejectedRetryResponse = await rejectedApplicant.page.request.post('/api/join-requests', {
        data: {
          organizationId: ownerMembership.organizationId,
          message: 'Trying again immediately after rejection should show the applicant denial path.',
        },
      })
      expect(rejectedRetryResponse.status(), `Rejected applicant retry returned ${rejectedRetryResponse.status()}`).toBe(429)
      expect(JSON.stringify(await rejectedRetryResponse.json())).toContain('previous request was recently declined')
    }
    finally {
      await Promise.all([
        approvedApplicant.close(),
        rejectedApplicant.close(),
      ])
    }
  })
})
