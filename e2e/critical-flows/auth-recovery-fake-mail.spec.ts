import { rm } from 'node:fs/promises'
import { test, expect, createGuestPage, withGuestContext } from '../fixtures'
import { type CapturedEmail, readCapturedEmails } from '../helpers/captured-emails'

function extractResetUrl(email: CapturedEmail) {
  const content = `${email.text}\n${email.html}`
  const pathOrUrl = content
    .match(/(?:https?:\/\/[^\s"'<>]+)?\/(?:api\/auth\/reset-password\/|auth\/reset-password)[^\s"'<>]*/)?.[0]
    ?.replaceAll('&amp;', '&')
  if (!pathOrUrl) return ''

  return new URL(pathOrUrl, process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3333').toString()
}

test.describe('Auth recovery fake mail', () => {
  test('resets a real user password through the captured reset email', async ({ authenticatedPage, testAccount, browser }) => {
    const capturePath = process.env.FACTORY_EMAIL_CAPTURE_PATH
    expect(capturePath, 'FACTORY_EMAIL_CAPTURE_PATH must be set for auth recovery E2E').toBeTruthy()
    expect(process.env.FACTORY_EMAIL_TEST_MODE, 'auth recovery E2E must use capture mode, not a real provider').toBe('capture')
    expect(process.env.FACTORY_ADMIN_SSO_ONLY, 'auth recovery E2E needs email/password auth enabled').toBe('false')

    await expect(authenticatedPage.getByRole('heading', { name: /Dashboard|Welcome/i })).toBeVisible({ timeout: 30_000 })
    await rm(capturePath!, { force: true })

    const newPassword = `${testAccount.password}-Reset1`
    const guest = await createGuestPage(browser)
    const guestPage = guest.page

    try {
      await guestPage.goto('/auth/forgot-password')
      await guestPage.waitForLoadState('networkidle')
      await expect(guestPage.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
      await guestPage.getByLabel('Email').fill(testAccount.email)

      await guestPage.getByRole('button', { name: 'Send reset link' }).click()
      await expect(guestPage.getByText("If an account with that email exists, we've sent a password reset link.")).toBeVisible()

      await expect.poll(async () => (await readCapturedEmails(capturePath!)).length, {
        message: 'password reset email should be captured',
        timeout: 10_000,
      }).toBeGreaterThanOrEqual(1)

      const capturedEmails = await readCapturedEmails(capturePath!)
      const resetEmail = capturedEmails.find(email => email.subject === 'Reset your password — Factory Careers')
      expect(resetEmail, 'password reset email should be captured').toBeTruthy()
      expect(resetEmail?.renderError, 'password reset email should render successfully').toBeUndefined()
      expect(resetEmail?.to).toContain(testAccount.email)
      expect(resetEmail?.text).toContain('Reset your password')

      const resetUrl = extractResetUrl(resetEmail!)
      expect(resetUrl, 'reset email should contain a local reset URL').toBeTruthy()
      const parsedResetUrl = new URL(resetUrl)
      const apiToken = parsedResetUrl.pathname.match(/^\/api\/auth\/reset-password\/([^/]+)$/)?.[1]
      expect(
        parsedResetUrl.pathname === '/auth/reset-password' || Boolean(apiToken),
        'reset email should link to a supported reset route',
      ).toBe(true)
      expect(parsedResetUrl.searchParams.get('token') ?? apiToken, 'reset email should include a reset token').toBeTruthy()
      expect(parsedResetUrl.hostname).not.toBe('thefactoryhq.com')

      await withGuestContext(browser, async (resetPage) => {
        await resetPage.goto(resetUrl)
        await resetPage.waitForLoadState('networkidle')
        await expect(resetPage.getByRole('heading', { name: 'Set new password' })).toBeVisible()
        await resetPage.getByLabel('New password', { exact: true }).fill(newPassword)
        await resetPage.getByLabel('Confirm new password').fill(newPassword)

        const [resetResponse] = await Promise.all([
          resetPage.waitForResponse(
            resp => resp.url().includes('/api/auth/reset-password') && resp.request().method() === 'POST',
            { timeout: 30_000 },
          ),
          resetPage.getByRole('button', { name: 'Reset password' }).click(),
        ])
        expect(resetResponse.status(), `Reset password API returned ${resetResponse.status()}`).toBe(200)
        await expect(resetPage.getByText('Your password has been reset successfully.')).toBeVisible()
      })

      await withGuestContext(browser, async (oldPasswordPage) => {
        const oldSignInResponse = await oldPasswordPage.request.post('/api/auth/sign-in/email', {
          data: {
            email: testAccount.email,
            password: testAccount.password,
          },
        })
        expect(oldSignInResponse.status(), 'old password should no longer sign in').toBeGreaterThanOrEqual(400)
      })

      const newSignInResponse = await guestPage.request.post('/api/auth/sign-in/email', {
        data: {
          email: testAccount.email,
          password: newPassword,
        },
      })
      expect(newSignInResponse.status(), `new password sign-in returned ${newSignInResponse.status()}`).toBe(200)
      await guestPage.goto('/dashboard')
      await guestPage.waitForLoadState('networkidle')
      await expect(guestPage.getByRole('heading', { name: /Dashboard|Welcome/i })).toBeVisible({ timeout: 30_000 })
    }
    finally {
      await guest.close()
    }
  })
})