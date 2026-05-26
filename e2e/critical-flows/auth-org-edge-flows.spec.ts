import { test, expect } from '../fixtures'

async function signUpWithoutOrganization(page: import('@playwright/test').Page, account: {
  name: string
  email: string
  password: string
}) {
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
  } else {
    await page.waitForLoadState('networkidle')
  }
}

test.describe('Auth and organization edge flows', () => {
  test('new user accepts an invite link through onboarding and lands in the invited organization', async ({ authenticatedPage, testAccount, browser }, testInfo) => {
    const ownerPage = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`

    const createLinkResponse = await ownerPage.request.post('/api/invite-links', {
      data: {
        role: 'member',
        maxUses: 1,
        expiresInHours: 24,
      },
    })
    expect(createLinkResponse.status(), `Create invite link API returned ${createLinkResponse.status()}`).toBe(201)
    const inviteLink = await createLinkResponse.json() as { token: string; maxUses: number; useCount: number }
    expect(inviteLink.token, 'invite token must be returned for test-local acceptance').toMatch(/^[0-9a-f]{64}$/)
    expect(inviteLink.maxUses).toBe(1)
    expect(inviteLink.useCount).toBe(0)

    const baseURL = testInfo.project.use.baseURL as string
    const context = await browser.newContext({ baseURL })
    const inviteePage = await context.newPage()

    try {
      const invitee = {
        name: `Invitee ${unique}`,
        email: `auth-org-invitee.${unique}@test.local`,
        password: process.env.E2E_TEST_PASSWORD || 'TestPassword123!',
      }

      await signUpWithoutOrganization(inviteePage, invitee)

      await expect(inviteePage.getByRole('heading', { name: 'Create your organization' })).toBeVisible({ timeout: 15_000 })
      await inviteePage.getByRole('button', { name: 'Join an existing organization instead' }).click()
      await expect(inviteePage.getByRole('heading', { name: 'Join an organization' })).toBeVisible()

      await inviteePage.getByPlaceholder('Paste invite link or code').fill(`${baseURL}/join/${inviteLink.token}`)
      const [acceptResponse] = await Promise.all([
        inviteePage.waitForResponse(
          resp => resp.url().includes('/api/invite-links/accept') && resp.request().method() === 'POST',
          { timeout: 30_000 },
        ),
        inviteePage.getByRole('button', { name: 'Join' }).click(),
      ])
      expect(acceptResponse.status(), `Accept invite link API returned ${acceptResponse.status()}`).toBe(200)
      const accepted = await acceptResponse.json() as { organizationName: string; role: string }
      expect(accepted.organizationName).toBe(testAccount.orgName)
      expect(accepted.role).toBe('member')

      await expect(inviteePage.getByRole('heading', { name: "You're in!" })).toBeVisible({ timeout: 15_000 })
      await inviteePage.waitForURL('**/dashboard', { waitUntil: 'networkidle', timeout: 30_000 })
      await expect(inviteePage.getByRole('heading', { name: 'Welcome to Factory Careers' })).toBeVisible({ timeout: 15_000 })

      await inviteePage.goto('/dashboard/settings', { waitUntil: 'networkidle' })
      await expect(inviteePage.getByRole('heading', { name: 'General' })).toBeVisible({ timeout: 15_000 })
      await expect(inviteePage.getByLabel('Organization name')).toHaveValue(testAccount.orgName)

      const dashboardResponse = await inviteePage.request.get('/api/dashboard/stats')
      expect(dashboardResponse.status(), `Dashboard stats API returned ${dashboardResponse.status()}`).toBe(200)
    } finally {
      await context.close()
    }
  })
})
