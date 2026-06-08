import type { Page } from '@playwright/test'
import { test, expect, selectFactorySelectOption } from '../fixtures'
import { setupCaptureFile } from '../helpers/captured-jsonl'
import { type CapturedEmail, readCapturedEmails } from '../helpers/captured-emails'
import {
  assertE2eDatabaseUrl,
  countApplicationRows,
  countCandidateRows,
  countPrivacyAuditRows,
  lookupCandidateApplication,
  lookupPrivacyRequest,
} from '../helpers/db'

function extractVerifyUrl(email: CapturedEmail) {
  const content = `${email.text}\n${email.html}`
  const path = content.match(/\/api\/privacy-requests\/verify\?token=[^\s"'<>]+/)?.[0]
  if (!path) return ''

  return new URL(path, process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3333').toString()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function signUpAndCreateOrganization(page: Page, id: string) {
  const account = {
    name: `Privacy Other ${id}`,
    email: `privacy.other.${id}@test.local`,
    password: 'TestPassword123!',
    orgName: `Privacy Other Org ${id}`,
  }

  await page.goto('/auth/sign-up')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Name').fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByLabel('Confirm password').fill(account.password)
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/auth/sign-up') && resp.status() === 200, { timeout: 30_000 }),
    page.getByRole('button', { name: 'Sign up' }).click(),
  ])
  await page.waitForURL(url => url.pathname.includes('/onboarding/') || url.pathname.includes('/auth/sign-in'), { waitUntil: 'commit', timeout: 30_000 })

  if (page.url().includes('/auth/sign-in')) {
    await page.getByLabel('Email').fill(account.email)
    await page.getByLabel('Password').fill(account.password)
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/auth/sign-in') && resp.status() === 200, { timeout: 30_000 }),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ])
    await page.waitForURL('**/onboarding/**', { waitUntil: 'commit', timeout: 30_000 })
  }

  await page.getByLabel('Organization name').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByLabel('Organization name').fill(account.orgName)
  await page.getByRole('button', { name: 'Create organization' }).click()
  await page.waitForURL('**/dashboard**', { waitUntil: 'commit', timeout: 30_000 })
}

test.describe('Privacy request fake mail', () => {
  test('verifies deletion request persistence, fake-mail verification, and confirmation', async ({ page }, testInfo) => {
    expect(process.env.FACTORY_EMAIL_TEST_MODE, 'E2E mail must use capture mode, not a real provider').toBe('capture')
    assertE2eDatabaseUrl('privacy request e2e coverage')
    const capturePath = await setupCaptureFile('FACTORY_EMAIL_CAPTURE_PATH', 'privacy request E2E')

    const id = `${Date.now()}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2)}`
      const requester = {
        name: `Privacy Requester ${id}`,
        email: `privacy.requester.${id}@example.com`,
        state: 'California',
        context: `Candidate role context ${id}`,
        details: `Please review deletion for application fixture ${id}.`,
      }
      const privacyInbox = process.env.FACTORY_CAREERS_PRIVACY_INBOX || 'legal@thefactoryhq.com'

      await page.goto('/privacy/delete-request')
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: 'Request deletion of applicant information' })).toBeVisible()
      await page.getByLabel('Name').fill(requester.name)
      await page.getByLabel('Email').fill(requester.email)
      await selectFactorySelectOption(page, /State of residence/, requester.state)
      await page.getByLabel('Role or application context').fill(requester.context)
      await page.getByLabel('Details').fill(requester.details)

      const [submitResponse] = await Promise.all([
        page.waitForResponse(
          resp => resp.url().includes('/api/privacy-requests') && resp.request().method() === 'POST',
          { timeout: 30_000 },
        ),
        page.getByRole('button', { name: 'Submit deletion request' }).click(),
      ])
      expect(submitResponse.status()).toBe(202)
      await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

    await expect.poll(async () => (await readCapturedEmails(capturePath)).length, {
      message: 'privacy request should capture requester verification and internal alert emails',
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(2)

    const request = await lookupPrivacyRequest(requester.email)
    expect(request, 'privacy request should be persisted').toBeTruthy()
    expect(request).toMatchObject({
      status: 'submitted',
      requesterName: requester.name,
      requesterEmail: requester.email,
      stateOfResidence: requester.state,
      verifiedAt: null,
    })
    expect(request?.details).toContain(requester.context)
    expect(request?.details).toContain(requester.details)
    expect(request?.verificationTokenHash).toMatch(/^[a-f0-9]{64}$/)

    const capturedEmails = await readCapturedEmails(capturePath)
    const verificationEmail = capturedEmails.find((email) => email.subject === 'Verify your deletion request — Factory Careers')
    expect(verificationEmail, 'requester verification email should be captured').toBeTruthy()
    expect(verificationEmail?.renderError, 'requester verification email should render successfully').toBeUndefined()
    expect(verificationEmail?.to).toContain(requester.email)
    expect(verificationEmail?.text).toContain(requester.name)
    expect(verificationEmail?.text).toContain('Verify your deletion request')

    const verifyUrl = extractVerifyUrl(verificationEmail!)
    expect(verifyUrl, 'verification email should contain a local verification URL').toContain('/api/privacy-requests/verify?token=')
    expect(verifyUrl).not.toContain(request!.verificationTokenHash)
    expect(verifyUrl).not.toContain('thefactoryhq.com')

    const internalAlert = capturedEmails.find((email) => email.subject === `Privacy deletion request: ${requester.email}`)
    expect(internalAlert, 'privacy-team alert email should be captured').toBeTruthy()
    expect(internalAlert?.renderError, 'privacy-team alert email should render successfully').toBeUndefined()
    expect(internalAlert?.to).toContain(privacyInbox)
    expect(internalAlert?.text).toContain(requester.name)
    expect(internalAlert?.text).toContain(requester.email)
    expect(internalAlert?.text).toContain(requester.state)

    const verifyResponse = await page.request.get(verifyUrl)
    expect(verifyResponse.status()).toBe(200)
    await expect.poll(async () => (await lookupPrivacyRequest(requester.email))?.status, {
      message: 'privacy request should move to verified after opening the verification URL',
      timeout: 10_000,
    }).toBe('verified')

    const verifiedRequest = await lookupPrivacyRequest(requester.email)
    expect(verifiedRequest?.verifiedAt).toBeTruthy()

    await expect.poll(async () => (await readCapturedEmails(capturePath)).length, {
      message: 'privacy verification should capture confirmation email',
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(3)

    const confirmationEmail = (await readCapturedEmails(capturePath))
      .find((email) => email.subject === 'Deletion request verified — Factory Careers')
    expect(confirmationEmail, 'requester confirmation email should be captured').toBeTruthy()
    expect(confirmationEmail?.renderError, 'requester confirmation email should render successfully').toBeUndefined()
    expect(confirmationEmail?.to).toContain(requester.email)
    expect(confirmationEmail?.text).toContain('Request verified')
  })

  test('fulfills a verified deletion request from the dashboard and removes matched applicant data', async ({ authenticatedPage, browser }, testInfo) => {
    expect(process.env.FACTORY_EMAIL_TEST_MODE, 'E2E mail must use capture mode, not a real provider').toBe('capture')
    assertE2eDatabaseUrl('privacy request e2e coverage')
    const capturePath = await setupCaptureFile('FACTORY_EMAIL_CAPTURE_PATH', 'privacy request E2E')
    const page = authenticatedPage
    const id = `${Date.now()}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2)}`
    const requester = {
      firstName: 'Privacy',
      lastName: `Applicant ${id}`,
      name: `Privacy Applicant ${id}`,
      email: `privacy.applicant.${id}@example.com`,
      state: 'California',
      applicationState: 'CA',
    }

    const createJobResponse = await page.request.post('/api/jobs', {
        data: {
          title: `Privacy Fulfillment Role ${id}`,
          description: 'Role used to verify privacy request fulfillment removes applicant data.',
          location: 'Remote',
          type: 'full_time',
          requireResume: false,
          requireCoverLetter: false,
          autoScoreOnApply: false,
          applicationComplianceEnabled: false,
        },
      })
      expect(createJobResponse.status(), `Create job API returned ${createJobResponse.status()}`).toBe(201)
      const createdJob = await createJobResponse.json() as { id: string, slug: string }

      const publishJobResponse = await page.request.patch(`/api/jobs/${createdJob.id}`, {
        data: { status: 'open' },
      })
      expect(publishJobResponse.status(), `Publish job API returned ${publishJobResponse.status()}`).toBe(200)

      const applyResponse = await page.request.post(`/api/public/jobs/${createdJob.slug}/apply`, {
        data: {
          firstName: requester.firstName,
          lastName: requester.lastName,
          email: requester.email,
          phone: '555-0100',
          country: 'United States',
          state: requester.applicationState,
          coverLetterText: 'Please delete this applicant record when the privacy request is fulfilled.',
          responses: [],
        },
      })
      expect(applyResponse.status(), `Apply API returned ${applyResponse.status()}`).toBe(201)

    const candidateApplication = await lookupCandidateApplication(requester.email)
      expect(candidateApplication, 'candidate/application fixture should be persisted').toBeTruthy()

      const privacyResponse = await page.request.post('/api/privacy-requests', {
        data: {
          requesterName: requester.name,
          requesterEmail: requester.email,
          stateOfResidence: requester.state,
          applicationId: candidateApplication!.applicationId,
          requestContext: `Privacy Fulfillment Role ${id}`,
          details: 'Please delete the application and candidate profile linked to this request.',
        },
      })
      expect(privacyResponse.status(), `Privacy request API returned ${privacyResponse.status()}`).toBe(202)

    await expect.poll(async () => (await readCapturedEmails(capturePath)).length, {
        message: 'privacy request should capture verification email',
        timeout: 10_000,
      }).toBeGreaterThanOrEqual(1)

    const verificationEmail = (await readCapturedEmails(capturePath))
        .find((email) => email.subject === 'Verify your deletion request — Factory Careers')
      expect(verificationEmail, 'requester verification email should be captured').toBeTruthy()
      const verifyUrl = extractVerifyUrl(verificationEmail!)
      expect(verifyUrl).toContain('/api/privacy-requests/verify?token=')
      expect(verifyUrl).not.toContain('thefactoryhq.com')

      const verifyResponse = await page.request.get(verifyUrl)
      expect(verifyResponse.status()).toBe(200)
    await expect.poll(async () => (await lookupPrivacyRequest(requester.email))?.status, {
        message: 'privacy request should move to verified before dashboard fulfillment',
        timeout: 10_000,
      }).toBe('verified')

    const verifiedRequest = await lookupPrivacyRequest(requester.email)
      expect(verifiedRequest).toMatchObject({
        organizationId: candidateApplication!.organizationId,
        applicationId: candidateApplication!.applicationId,
        requesterEmail: requester.email,
      })
      expect(verifiedRequest?.verifiedAt).toBeTruthy()

      const otherContext = await browser.newContext()
      const otherPage = await otherContext.newPage()
      try {
        await signUpAndCreateOrganization(otherPage, id)
        const wrongTenantDetail = await otherPage.request.get(`/api/privacy-requests/${verifiedRequest!.id}`)
        expect(wrongTenantDetail.status(), `Wrong-tenant detail API returned ${wrongTenantDetail.status()}`).toBe(404)
        const wrongTenantFulfill = await otherPage.request.post(`/api/privacy-requests/${verifiedRequest!.id}/fulfill`, {
          data: {
            candidateIds: [candidateApplication!.candidateId],
            resolutionNotes: 'Wrong tenant should not fulfill this request.',
          },
        })
        expect(wrongTenantFulfill.status(), `Wrong-tenant fulfill API returned ${wrongTenantFulfill.status()}`).toBe(404)
      }
      finally {
        await otherContext.close()
      }

      await page.goto('/dashboard/settings/privacy-requests')
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: 'Privacy Requests' })).toBeVisible({ timeout: 15_000 })
      const requesterEmailPattern = new RegExp(escapeRegExp(requester.email))
      await expect(page.getByRole('button', { name: requesterEmailPattern })).toBeVisible()
      await expect(page.getByText(requester.email).first()).toBeVisible()
      await expect(page.getByText('verified').first()).toBeVisible()
      await expect(page.getByText(requester.name).first()).toBeVisible()
      await expect(page.getByText(requester.email).nth(1)).toBeVisible()

      await page.getByRole('checkbox', { name: requesterEmailPattern }).check()
      await page.getByLabel('Resolution notes').fill(`Completed deletion for ${requester.email}`)
      await Promise.all([
        page.waitForResponse(resp => resp.url().includes(`/api/privacy-requests/${verifiedRequest!.id}/fulfill`) && resp.request().method() === 'POST' && resp.status() === 200),
        page.getByRole('button', { name: 'Fulfill deletion' }).click(),
      ])

      await expect(page.getByText('Deletion request fulfilled.')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('completed').first()).toBeVisible()
      await expect(page.getByText('No candidates match this verified email in the active organization.')).toBeVisible()

    await expect.poll(() => countCandidateRows(candidateApplication!.candidateId), {
        message: 'fulfillment should delete matched candidate personal data',
        timeout: 10_000,
      }).toBe(0)
    await expect.poll(() => countApplicationRows(candidateApplication!.applicationId), {
        message: 'fulfillment should cascade-delete matched application data',
        timeout: 10_000,
      }).toBe(0)

    const completedRequest = await lookupPrivacyRequest(requester.email)
      expect(completedRequest).toMatchObject({
        id: verifiedRequest!.id,
        status: 'completed',
        organizationId: candidateApplication!.organizationId,
      })
      expect(completedRequest?.completedAt).toBeTruthy()
      expect(completedRequest?.resolutionNotes).toContain(requester.email)
    await expect.poll(() => countPrivacyAuditRows(candidateApplication!.organizationId, verifiedRequest!.id), {
        message: 'privacy fulfillment should preserve an audit trail',
        timeout: 10_000,
      }).toBeGreaterThanOrEqual(1)
  })
})
