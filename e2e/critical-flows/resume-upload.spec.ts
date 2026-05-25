import { type Browser } from '@playwright/test'
import { test, expect } from '../fixtures'
import {
  VALID_FILE_CONFIGS,
  INVALID_FILE_CONFIGS,
  type TestFileConfig,
} from '../fixtures/test-buffers'

/**
 * Critical flow: Resume / CV file upload browser smoke.
 *
 * The full PDF/DOC/DOCX/TXT/PNG MIME matrix lives in the fast unit-level
 * document MIME tests. This browser spec keeps only the UI + multipart path:
 * 1. A valid PDF resume can be submitted end-to-end.
 * 2. An invalid PNG resume is rejected by the server without confirmation.
 *
 * Recruiter setup (shared across tests):
 *   1. Create a job via the 4-step wizard
 *   2. Step 2: enable "Require resume/CV"
 *   3. Step 4: publish the job → capture the application URL
 */

const JOB_TITLE = 'File Upload Format Test'
const JOB_DESCRIPTION = 'Testing all supported document upload formats.'
const JOB_LOCATION = 'Remote'

let applicationLink = ''
let jobSlug = ''

function applicant(index: number) {
  return {
    firstName: 'Upload',
    lastName: `Tester${index}`,
    email: `upload-tester-${index}-${Date.now()}@example.com`,
    phone: '+1 555 000 0000',
  }
}

test.describe('Resume Upload — Browser Smoke', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // One-time setup: create & publish the job
  // ─────────────────────────────────────────────────────────────────────────

  test.beforeAll('create and publish a job requiring resume', async ({ browser }) => {
    // We need a fresh authenticated page to set up the job.
    // Re-use the same signup logic from fixtures.ts.
    const context = await browser.newContext()
    const page = await context.newPage()

    const id = `${Date.now()}-setup`
    const account = {
      name: `Upload Test Recruiter ${id}`,
      email: `upload-test-${id}@test.local`,
      password: 'TestPassword123!',
      orgName: `Upload Test Org ${id}`,
    }

    // ── Sign up ────────────────────────────────────────────────────────────
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
    await page.waitForURL('**/dashboard**', { waitUntil: 'commit' })

    // ── Create job ─────────────────────────────────────────────────────────

    // Step 1: Job details
    await page.goto('/dashboard/jobs/new')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Job title').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByLabel('Job title').fill(JOB_TITLE)
    await page.locator('textarea').first().fill(JOB_DESCRIPTION)
    await page.getByLabel('Location').fill(JOB_LOCATION)

    await page.locator('form').getByRole('button', { name: 'Save & continue' }).first()
      .waitFor({ state: 'attached', timeout: 10_000 })
    await expect(page.locator('form').getByRole('button', { name: 'Save & continue' }).first())
      .toBeEnabled({ timeout: 10_000 })
    await page.locator('form').getByRole('button', { name: 'Save & continue' }).first().click()

    // Step 2: Application form — enable resume
    const resumeRadioGroup = page.getByRole('radiogroup', { name: /Resume requirement/i })
    await resumeRadioGroup.waitFor({ state: 'visible', timeout: 10_000 })
    const resumeRequiredRadio = resumeRadioGroup.getByRole('radio', { name: 'Required' })
    if ((await resumeRequiredRadio.getAttribute('aria-checked')) !== 'true') {
      await resumeRequiredRadio.click()
    }

    // Step 2 → Step 3 (Scoring criteria)
    await page.locator('form').getByRole('button', { name: 'Save & continue' }).first().click()

    // Step 3 → Step 4 (Publish)
    await page.locator('form').getByRole('button', { name: 'Save & continue' }).first()
      .waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('form').getByRole('button', { name: 'Save & continue' }).first().click()

    // Step 4: Publish
    await expect(page.getByRole('heading', { name: /Ready to go\?/i })).toBeVisible({ timeout: 10_000 })
    const publishButton = page.locator('form').getByRole('button', { name: /Publish & copy link/i })
    await publishButton.waitFor({ state: 'visible', timeout: 10_000 })
    const [publishResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/jobs') && ['POST', 'PATCH'].includes(resp.request().method()),
        { timeout: 30_000 },
      ),
      publishButton.click(),
    ])
    expect([200, 201], `Publish API returned ${publishResponse.status()}`).toContain(publishResponse.status())
    await expect(page.getByRole('heading', { name: 'Your job is live!' })).toBeVisible({ timeout: 30_000 })

    applicationLink = await page.getByRole('link', { name: 'Preview' }).getAttribute('href') ?? ''
    expect(applicationLink, 'Preview link must include the public application URL').not.toBe('')
    expect(applicationLink).toMatch(/\/jobs\/[^/]+\/apply(?:$|[?#])/)
    const slugMatch = applicationLink.match(/\/jobs\/([^/]+)\/apply(?:$|[?#])/)
    jobSlug = slugMatch?.[1] ?? ''
    expect(jobSlug.length).toBeGreaterThan(0)

    await page.close()
    await context.close()
  })

  test('accepts a valid PDF resume upload', async ({ browser }) => {
    await assertUploadResult(browser, VALID_FILE_CONFIGS[0]!, 'success')
  })

  test('rejects an invalid PNG resume upload', async ({ browser }) => {
    await assertUploadResult(browser, INVALID_FILE_CONFIGS.find(file => file.mimeType === 'image/png')!, 'rejected')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Shared test logic
// ─────────────────────────────────────────────────────────────────────────────

async function assertUploadResult(
  browser: Browser,
  fileConfig: TestFileConfig,
  expected: 'success' | 'rejected',
) {
  const idx = Date.now()
  const candidate = applicant(idx)

  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  await page.goto(applicationLink)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: JOB_TITLE })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /submit/i }).waitFor({ state: 'visible', timeout: 15_000 })

  // ── Fill basic applicant info ──────────────────────────────────────────
  await page.getByLabel('First name').fill(candidate.firstName)
  await page.getByLabel('Last name').fill(candidate.lastName)
  await page.getByLabel('Email').fill(candidate.email)
  await page.getByLabel('Phone').fill(candidate.phone)
  await page.getByLabel(/Country/).selectOption({ label: 'United States' })
  await page.getByLabel(/State/).selectOption({ label: 'California' })

  // ── Upload resume (built-in required field) ────────────────────────────
  // Built-in resume: <input id="resume" type="file" ...>
  const resumeInput = page.locator('input#resume[type="file"]')

  // Upload the test file directly to the built-in resume input.
  await resumeInput.setInputFiles({
    name: fileConfig.filename,
    mimeType: fileConfig.mimeType,
    buffer: fileConfig.buffer,
  })
  await expect(page.getByText(fileConfig.filename)).toBeVisible({ timeout: 5_000 })

  // ── Submit ─────────────────────────────────────────────────────────────
  const [response] = await Promise.all([
    page.waitForResponse(
      resp =>
        resp.url().includes(`/api/public/jobs/${jobSlug}/apply`)
        && resp.request().method() === 'POST',
      { timeout: 30_000 },
    ),
    page.getByRole('button', { name: /submit/i }).click(),
  ])

  const status = response.status()

  if (expected === 'success') {
    expect(status, `${fileConfig.label}: expected 2xx but got ${status}`).toBeGreaterThanOrEqual(200)
    expect(status, `${fileConfig.label}: expected 2xx but got ${status}`).toBeLessThan(300)

    // Verify confirmation page
    await page.waitForURL(`**/jobs/${jobSlug}/confirmation`, {
      waitUntil: 'commit',
      timeout: 15_000,
    })
    await expect(page.getByRole('heading', { name: 'Application submitted' })).toBeVisible()
  } else {
    // Server should reject with 400
    expect(status, `${fileConfig.label}: expected 400 but got ${status}`).toBe(400)

    // The candidate should still be on the apply page (no redirect to confirmation)
    expect(page.url()).toContain('/apply')
  }

  await page.close()
  await ctx.close()
}
