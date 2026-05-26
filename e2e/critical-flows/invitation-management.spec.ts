import { test, expect } from '../fixtures'

/**
 * Critical flow: Invitation management (invite, resend, cancel).
 *
 * Steps:
 * 1. Owner signs up, creates org (via fixture)
 * 2. Owner navigates to Settings → Members
 * 3. Owner invites a new member
 * 4. Pending invitation appears in the list
 * 5. Owner resends the invitation
 * 6. Owner cancels the invitation
 */

test.describe('Invitation Management Flow', () => {
  test('owner can invite, resend, and cancel an invitation', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const invitedEmail = `invited-member-${Date.now()}@test.local`

    // ── Navigate to Members page ──────────────────────────
    await page.goto('/dashboard/settings/members')
    await page.waitForLoadState('networkidle')

    // Wait for the page to fully load
    await page.getByText('Members').first().waitFor({ state: 'visible', timeout: 15_000 })

    // ── Step 1: Invite a new member ───────────────────────
    const inviteButton = page.getByRole('button', { name: 'Invite team member' })
    await inviteButton.waitFor({ state: 'visible', timeout: 10_000 })
    await inviteButton.click()

    // Fill in the invite form
    const emailInput = page.getByPlaceholder('colleague@company.com')
    await emailInput.waitFor({ state: 'visible', timeout: 10_000 })
    await emailInput.fill(invitedEmail)

    // Submit the invitation and wait for the server mutation.
    const [inviteResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/auth/organization/invite-member')
          && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Send invite' }).click(),
    ])
    expect(inviteResponse.status(), `Invite API returned ${inviteResponse.status()}`).toBe(200)

    // ── Step 2: Verify pending invitation appears ─────────
    // The pending invitations section should now show
    await expect(page.getByText('Pending invitations')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: invitedEmail })).toBeVisible({ timeout: 10_000 })

    // ── Step 3: Resend the invitation ─────────────────────
    const resendButton = page.getByRole('button', { name: 'Resend' })
    await resendButton.waitFor({ state: 'visible', timeout: 10_000 })
    const [resendResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/auth/organization/invite-member')
          && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      resendButton.click(),
    ])
    expect(resendResponse.status(), `Resend API returned ${resendResponse.status()}`).toBe(200)

    // Invitation should still appear in the list
    await expect(page.getByRole('link', { name: invitedEmail })).toBeVisible()

    // ── Step 4: Cancel the invitation ─────────────────────
    const pendingInviteRow = page
      .locator('.ui-list-row')
      .filter({ has: page.getByRole('link', { name: invitedEmail }) })
    await expect(pendingInviteRow).toBeVisible()

    const cancelButton = pendingInviteRow.getByRole('button', { name: 'Cancel' })
    await cancelButton.waitFor({ state: 'visible', timeout: 10_000 })
    await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/auth/organization/cancel-invitation')
          && resp.request().method() === 'POST'
          && resp.status() === 200,
        { timeout: 30_000 },
      ),
      page.waitForResponse(
        resp => resp.url().includes('/api/auth/organization/list-invitations')
          && resp.status() === 200,
        { timeout: 30_000 },
      ),
      cancelButton.click(),
    ])

    // After cancellation, the invitation should no longer appear
    // (or the pending invitations section could be hidden entirely if empty)
    const pendingSection = page.getByText('Pending invitations')
    const invitedEmailLink = page.getByRole('link', { name: invitedEmail })

    // Either the section is gone or the email is no longer listed
    const isHidden = await pendingSection.isHidden().catch(() => true)
    if (!isHidden) {
      // Section still visible - email should not be in it
      await expect(invitedEmailLink).toBeHidden({ timeout: 10_000 })
    }
  })
})
