import { test, expect, signUpUser } from '../fixtures'
import { grantOrganizationRole, lookupMembership } from '../helpers/db'

test.describe('RBAC role permissions', () => {
  test('member UI restrictions agree with direct API authorization while owner actions still work', async ({ authenticatedPage, testAccount, browser }, testInfo) => {
    const ownerPage = authenticatedPage
    const ownerMembership = await lookupMembership(testAccount.email, testAccount.orgName)
    const member = await signUpUser(browser, {
      label: `member-${testInfo.workerIndex}`,
      withOrg: true,
    })

    try {
      await grantOrganizationRole(member.userId, ownerMembership.organizationId, 'member')

      const memberApi = member.page.context().request
      const ownerApi = ownerPage.context().request
      const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:13000'

      const activeOrgResponse = await memberApi.post('/api/auth/organization/set-active', {
        headers: { origin },
        data: { organizationId: ownerMembership.organizationId },
      })
      expect(activeOrgResponse.status()).toBe(200)

      await ownerPage.goto('/dashboard/settings/members')
      await expect(ownerPage.getByRole('heading', { name: 'Members', exact: true })).toBeVisible()
      await expect(ownerPage.getByRole('button', { name: 'Invite team member' })).toBeVisible()
      await expect(ownerPage.getByRole('button', { name: 'New Job' }).first()).toBeVisible()

      const jobResponse = await ownerApi.post('/api/jobs', {
        data: {
          title: `RBAC Browser Role ${Date.now()}`,
          description: 'Owner-created job for RBAC browser coverage',
          location: 'Remote',
          type: 'full_time',
          requireResume: false,
        },
      })
      expect(jobResponse.status()).toBe(201)
      const job = await jobResponse.json()

      const candidateResponse = await ownerApi.post('/api/candidates', {
        data: {
          firstName: 'Robin',
          lastName: 'Rolecheck',
          email: `robin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
          phone: '+1 555 0177',
        },
      })
      expect(candidateResponse.status()).toBe(201)
      const candidate = await candidateResponse.json()

      const applicationResponse = await ownerApi.post('/api/applications', {
        data: {
          candidateId: candidate.id,
          jobId: job.id,
          notes: 'RBAC browser fixture',
        },
      })
      expect(applicationResponse.status()).toBe(201)
      const application = await applicationResponse.json()

      await member.page.goto('/dashboard/settings/members')
      await expect(member.page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible()
      await expect(member.page.getByRole('button', { name: 'Invite team member' })).toHaveCount(0)
      await expect(member.page.getByRole('button', { name: 'New Job' })).toHaveCount(0)

      await member.page.goto('/dashboard/jobs/new')
      await expect(member.page.getByText("You don't have permission to create jobs.")).toBeVisible()
      await expect(member.page.getByRole('button', { name: 'Save Draft' })).toHaveCount(0)

      const forbiddenJobResponse = await memberApi.post('/api/jobs', {
        data: {
          title: 'Member should not create jobs',
          description: 'RBAC denial fixture',
          location: 'Remote',
          type: 'full_time',
        },
      })
      expect(forbiddenJobResponse.status()).toBe(403)

      const forbiddenInviteResponse = await memberApi.post('/api/invite-links', {
        data: { role: 'member', expiresInHours: 24, maxUses: 1 },
      })
      expect(forbiddenInviteResponse.status()).toBe(403)

      const memberApplicationsResponse = await memberApi.get('/api/applications')
      expect(memberApplicationsResponse.status()).toBe(200)
      const memberApplications = await memberApplicationsResponse.json() as {
        data?: Array<{ id?: string }>
      }
      expect(
        memberApplications.data?.some((item) => item.id === application.id),
        `expected member application list to include ${application.id}`,
      ).toBe(true)

      await member.page.goto('/dashboard/applications')
      await expect(member.page.getByRole('heading', { name: 'Applications' })).toBeVisible()
      await expect(member.page.getByText('Robin Rolecheck')).toBeVisible()

      const crossOrgResponse = await memberApi.post('/api/auth/organization/set-active', {
        headers: { origin },
        data: { organizationId: member.organizationId },
      })
      expect(crossOrgResponse.status()).toBe(200)
      const hiddenApplicationResponse = await memberApi.get(`/api/applications/${application.id}`)
      expect(hiddenApplicationResponse.status()).toBe(404)
    }
    finally {
      await member.close()
    }
  })
})