import { type Browser, type Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import { VALID_FILE_CONFIGS } from '../fixtures/test-buffers'
import {
  attributeApplicationSource,
  deleteMembership,
  expireInviteLink,
  grantOrganizationRole,
  insertSsoProvider,
  lookupMembership,
} from '../helpers/db'

interface SignedInOrg {
  page: Page
  userId: string
  memberId: string
  organizationId: string
  close: () => Promise<void>
}

async function signUpWithOrg(browser: Browser, label: string): Promise<SignedInOrg> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const account = {
    name: `Security ${label} ${id}`,
    email: `security-${label}-${id}@test.local`,
    password: 'TestPassword123!',
    orgName: `Security ${label} Org ${id}`,
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

    await page.waitForURL('**/onboarding/**', { waitUntil: 'commit', timeout: 30_000 })
  }

  await page.getByLabel('Organization name').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByLabel('Organization name').fill(account.orgName)
  await page.getByRole('button', { name: 'Create organization' }).click()
  await page.waitForURL('**/dashboard**', { waitUntil: 'commit' })

  const membership = await lookupMembership(account.email, account.orgName)

  return {
    page,
    userId: membership.userId,
    memberId: membership.memberId,
    organizationId: membership.organizationId,
    close: () => context.close(),
  }
}

async function createTenantFixture(page: Page) {
  const api = page.context().request
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  const jobResponse = await api.post('/api/jobs', {
    data: {
      title: `Tenant Isolation Role ${suffix}`,
      description: 'Security isolation test role',
      location: 'Remote',
      type: 'full_time',
      requireResume: false,
    },
  })
  expect(jobResponse.status()).toBe(201)
  const job = await jobResponse.json()

  const candidateResponse = await api.post('/api/candidates', {
    data: {
      firstName: 'Ada',
      lastName: 'Isolated',
      email: `ada-${suffix}@example.com`,
      phone: '+1 555 0100',
    },
  })
  expect(candidateResponse.status()).toBe(201)
  const candidate = await candidateResponse.json()

  const applicationResponse = await api.post('/api/applications', {
    data: {
      candidateId: candidate.id,
      jobId: job.id,
      notes: 'Tenant isolation fixture',
    },
  })
  expect(applicationResponse.status()).toBe(201)
  const application = await applicationResponse.json()

  const interviewResponse = await api.post('/api/interviews', {
    data: {
      applicationId: application.id,
      title: `Security Screen ${suffix}`,
      type: 'video',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      duration: 30,
      timezone: 'UTC',
      calendarSync: false,
    },
  })
  expect(interviewResponse.status()).toBe(201)
  const interview = await interviewResponse.json()

  const criteriaResponse = await api.post(`/api/jobs/${job.id}/criteria`, {
    data: {
      criteria: [
        {
          key: 'security_fit',
          name: 'Security Fit',
          category: 'custom',
          maxScore: 10,
          weight: 50,
        },
      ],
    },
  })
  expect(criteriaResponse.status()).toBe(201)

  const candidatePropertyResponse = await api.post('/api/properties', {
    data: {
      entityType: 'candidate',
      type: 'text',
      name: `Security note ${suffix}`,
    },
  })
  expect(candidatePropertyResponse.status()).toBe(200)
  const candidateProperty = await candidatePropertyResponse.json()

  const applicationPropertyResponse = await api.post('/api/properties', {
    data: {
      entityType: 'application',
      type: 'number',
      name: `Security rating ${suffix}`,
      jobId: job.id,
    },
  })
  expect(applicationPropertyResponse.status()).toBe(200)
  const applicationProperty = await applicationPropertyResponse.json()

  const trackingLinkResponse = await api.post('/api/tracking-links', {
    data: {
      jobId: job.id,
      channel: 'linkedin',
      name: `LinkedIn security fixture ${suffix}`,
      utmSource: 'linkedin',
      utmMedium: 'social',
      utmCampaign: 'tenant-isolation',
    },
  })
  expect(trackingLinkResponse.status()).toBe(201)
  const trackingLink = await trackingLinkResponse.json()

  const pdf = VALID_FILE_CONFIGS.find(file => file.mimeType === 'application/pdf')
  expect(pdf).toBeTruthy()

  const documentResponse = await api.post(`/api/candidates/${candidate.id}/documents`, {
    multipart: {
      type: 'resume',
      file: {
        name: pdf!.filename,
        mimeType: pdf!.mimeType,
        buffer: pdf!.buffer,
      },
    },
  })
  expect(documentResponse.status()).toBe(201)
  const document = await documentResponse.json()

  const docx = VALID_FILE_CONFIGS.find(file => file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  expect(docx).toBeTruthy()

  const docxDocumentResponse = await api.post(`/api/candidates/${candidate.id}/documents`, {
    multipart: {
      type: 'resume',
      file: {
        name: docx!.filename,
        mimeType: docx!.mimeType,
        buffer: docx!.buffer,
      },
    },
  })
  expect(docxDocumentResponse.status()).toBe(201)
  const docxDocument = await docxDocumentResponse.json()

  return {
    job,
    candidate,
    application,
    interview,
    candidateProperty,
    applicationProperty,
    trackingLink,
    document,
    docxDocument,
  }
}

async function expectStatus(response: { status: () => number }, allowedStatuses: number[]) {
  expect(allowedStatuses, `unexpected response status ${response.status()}`).toContain(response.status())
}



test.describe('Security — tenant isolation and document access', () => {
  test('denies cross-organization direct resource and document access @security-core', async ({ browser }) => {
    const orgA = await signUpWithOrg(browser, 'org-a')
    const orgB = await signUpWithOrg(browser, 'org-b')
    let orgMember: SignedInOrg | undefined
    const anonymousContext = await browser.newContext()

    try {
      orgMember = await signUpWithOrg(browser, 'org-member')
      await grantOrganizationRole(orgMember.userId, orgA.organizationId, 'member')

      const fixture = await createTenantFixture(orgA.page)
      await attributeApplicationSource(orgA.organizationId, fixture.application.id, fixture.trackingLink.id)

      const orgAApi = orgA.page.context().request
      const orgBApi = orgB.page.context().request
      const memberApi = orgMember.page.context().request
      const anonymousApi = anonymousContext.request

      const publicTrackResponse = await anonymousApi.get(`/api/public/track/${fixture.trackingLink.code}`, {
        maxRedirects: 0,
      })
      expect(publicTrackResponse.status()).toBe(302)
      expect(publicTrackResponse.headers().location).toContain(`/jobs/${fixture.job.slug}/apply?ref=${encodeURIComponent(fixture.trackingLink.code)}`)

      const ownerDownload = await orgAApi.get(`/api/documents/${fixture.document.id}/download`)
      expect(ownerDownload.status()).toBe(200)
      expect(ownerDownload.headers()['cache-control']).toContain('no-store')
      expect(ownerDownload.headers()['content-disposition']).toContain('attachment')

      const ownerPreview = await orgAApi.get(`/api/documents/${fixture.document.id}/preview`)
      expect(ownerPreview.status()).toBe(200)
      expect(ownerPreview.headers()['content-type']).toContain('application/pdf')
      expect(ownerPreview.headers()['x-frame-options']).toBe('SAMEORIGIN')

      await expectStatus(await orgAApi.get(`/api/documents/${fixture.docxDocument.id}/preview`), [415])

      const ownerParse = await orgAApi.post(`/api/documents/${fixture.docxDocument.id}/parse`)
      expect(ownerParse.status()).toBe(200)
      const ownerParseBody = await ownerParse.json()
      expect(ownerParseBody).toMatchObject({
        id: fixture.docxDocument.id,
        parsed: true,
        sourceFormat: 'docx',
      })
      expect(ownerParseBody.wordCount).toBeGreaterThan(0)

      await expectStatus(await orgAApi.delete(`/api/documents/${fixture.docxDocument.id}`), [204])
      await expectStatus(await orgAApi.get(`/api/documents/${fixture.docxDocument.id}/download`), [404])

      await expectStatus(await orgAApi.get(`/api/interviews/${fixture.interview.id}`), [200])
      await expectStatus(await orgAApi.get(`/api/applications/${fixture.application.id}/scores`), [200])

      const orgAActivityForJob = await orgAApi.get(`/api/activity-log?resourceType=job&resourceId=${fixture.job.id}`)
      expect(orgAActivityForJob.status()).toBe(200)
      const orgAActivityForJobBody = await orgAActivityForJob.json()
      expect(orgAActivityForJobBody.data.every((item: any) => item.resourceType === 'job' && item.resourceId === fixture.job.id)).toBe(true)

      const orgASourceStats = await orgAApi.get('/api/source-tracking/stats')
      expect(orgASourceStats.status()).toBe(200)
      const orgASourceStatsBody = await orgASourceStats.json()
      expect(orgASourceStatsBody.summary.totalTracked).toBeGreaterThanOrEqual(1)
      expect(JSON.stringify(orgASourceStatsBody)).toContain(fixture.application.id)
      expect(JSON.stringify(orgASourceStatsBody)).toContain(fixture.trackingLink.id)

      await expectStatus(
        await orgAApi.put(`/api/candidates/${fixture.candidate.id}/properties/${fixture.candidateProperty.id}`, {
          data: { value: 'screened' },
        }),
        [200],
      )
      await expectStatus(
        await orgAApi.put(`/api/applications/${fixture.application.id}/properties/${fixture.applicationProperty.id}`, {
          data: { value: 7 },
        }),
        [200],
      )

      await expectStatus(await orgBApi.get(`/api/jobs/${fixture.job.id}`), [404])
      await expectStatus(await orgBApi.get(`/api/candidates/${fixture.candidate.id}`), [404])
      await expectStatus(await orgBApi.get(`/api/applications/${fixture.application.id}`), [404])
      await expectStatus(await orgBApi.get(`/api/interviews/${fixture.interview.id}`), [404])
      await expectStatus(await orgBApi.patch(`/api/interviews/${fixture.interview.id}`, {
        data: { title: 'Cross-org rename attempt' },
      }), [404])
      await expectStatus(await orgBApi.delete(`/api/interviews/${fixture.interview.id}`), [404])
      await expectStatus(await orgBApi.get(`/api/applications/${fixture.application.id}/scores`), [404])
      await expectStatus(await orgBApi.patch(`/api/properties/${fixture.candidateProperty.id}`, {
        data: { name: 'Cross-org rename attempt' },
      }), [404])
      await expectStatus(await orgBApi.delete(`/api/properties/${fixture.candidateProperty.id}`), [404])
      await expectStatus(await orgBApi.get(`/api/tracking-links/${fixture.trackingLink.id}`), [404])
      await expectStatus(await orgBApi.get(`/api/tracking-links/${fixture.trackingLink.id}/stats`), [404])
      await expectStatus(await orgBApi.get(`/api/documents/${fixture.document.id}/download`), [404])
      await expectStatus(await orgBApi.get(`/api/documents/${fixture.document.id}/preview`), [404])
      await expectStatus(await orgBApi.post(`/api/documents/${fixture.document.id}/parse`), [404])
      await expectStatus(await orgBApi.delete(`/api/documents/${fixture.document.id}`), [404])

      await expectStatus(
        await orgBApi.post('/api/comments', {
          data: {
            targetType: 'candidate',
            targetId: fixture.candidate.id,
            body: 'This must not attach to another org candidate',
          },
        }),
        [404],
      )

      await expectStatus(
        await orgBApi.post('/api/interviews', {
          data: {
            applicationId: fixture.application.id,
            title: 'Cross-org interview attempt',
            type: 'video',
            scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            duration: 30,
            calendarSync: false,
          },
        }),
        [404],
      )

      await expectStatus(
        await orgBApi.post(`/api/jobs/${fixture.job.id}/criteria`, {
          data: {
            criteria: [{
              key: 'cross_org',
              name: 'Cross-org',
              category: 'custom',
              maxScore: 10,
              weight: 50,
            }],
          },
        }),
        [404],
      )

      await expectStatus(
        await orgBApi.put(`/api/candidates/${fixture.candidate.id}/properties/${fixture.candidateProperty.id}`, {
          data: { value: 'cross-org write attempt' },
        }),
        [404],
      )
      await expectStatus(
        await orgBApi.put(`/api/applications/${fixture.application.id}/properties/${fixture.applicationProperty.id}`, {
          data: { value: 9 },
        }),
        [404],
      )
      await expectStatus(
        await orgBApi.post('/api/properties/reorder', {
          data: { ids: [fixture.candidateProperty.id] },
        }),
        [404],
      )

      const orgBProperties = await orgBApi.get(`/api/properties?entityType=application&jobId=${fixture.job.id}`)
      expect(orgBProperties.status()).toBe(200)
      const orgBPropertyBody = await orgBProperties.json()
      expect(JSON.stringify(orgBPropertyBody)).not.toContain(fixture.applicationProperty.id)

      const orgBActivityForOrgAJob = await orgBApi.get(`/api/activity-log?resourceType=job&resourceId=${fixture.job.id}`)
      expect(orgBActivityForOrgAJob.status()).toBe(200)
      expect(await orgBActivityForOrgAJob.json()).toMatchObject({ data: [], total: 0 })

      const orgBCandidateTimeline = await orgBApi.get(`/api/activity-log/candidate-timeline?candidateId=${fixture.candidate.id}`)
      expect(orgBCandidateTimeline.status()).toBe(200)
      expect(await orgBCandidateTimeline.json()).toMatchObject({ items: [] })

      const orgBSourceStats = await orgBApi.get(`/api/source-tracking/stats?jobId=${fixture.job.id}`)
      expect(orgBSourceStats.status()).toBe(200)
      const orgBSourceStatsBody = await orgBSourceStats.json()
      expect(orgBSourceStatsBody.summary.totalTracked).toBe(0)
      expect(JSON.stringify(orgBSourceStatsBody)).not.toContain(fixture.application.id)
      expect(JSON.stringify(orgBSourceStatsBody)).not.toContain(fixture.trackingLink.id)

      const pdf = VALID_FILE_CONFIGS.find(file => file.mimeType === 'application/pdf')!
      await expectStatus(
        await orgBApi.post(`/api/candidates/${fixture.candidate.id}/documents`, {
          multipart: {
            type: 'resume',
            file: {
              name: pdf.filename,
              mimeType: pdf.mimeType,
              buffer: pdf.buffer,
            },
          },
        }),
        [404],
      )

      await expectStatus(await anonymousApi.get(`/api/jobs/${fixture.job.id}`), [401, 403])
      await expectStatus(await anonymousApi.get(`/api/candidates/${fixture.candidate.id}`), [401, 403])
      await expectStatus(await anonymousApi.get(`/api/applications/${fixture.application.id}`), [401, 403])
      await expectStatus(await anonymousApi.get(`/api/interviews/${fixture.interview.id}`), [401, 403])
      await expectStatus(await anonymousApi.get(`/api/applications/${fixture.application.id}/scores`), [401, 403])
      await expectStatus(await anonymousApi.get('/api/source-tracking/stats'), [401, 403])
      await expectStatus(await anonymousApi.patch(`/api/properties/${fixture.candidateProperty.id}`, {
        data: { name: 'Anonymous rename attempt' },
      }), [401, 403])
      await expectStatus(await anonymousApi.get(`/api/tracking-links/${fixture.trackingLink.id}`), [401, 403])
      await expectStatus(await anonymousApi.get(`/api/tracking-links/${fixture.trackingLink.id}/stats`), [401, 403])
      await expectStatus(await anonymousApi.get(`/api/documents/${fixture.document.id}/download`), [401, 403])
      await expectStatus(await anonymousApi.get(`/api/documents/${fixture.document.id}/preview`), [401, 403])
      await expectStatus(await anonymousApi.post(`/api/documents/${fixture.document.id}/parse`), [401, 403])
      await expectStatus(await anonymousApi.delete(`/api/documents/${fixture.document.id}`), [401, 403])

      await expectStatus(await memberApi.get(`/api/jobs/${fixture.job.id}`), [200])
      await expectStatus(await memberApi.get(`/api/candidates/${fixture.candidate.id}`), [200])
      await expectStatus(await memberApi.get(`/api/applications/${fixture.application.id}`), [200])
      await expectStatus(await memberApi.get('/api/activity-log'), [200])

      await expectStatus(await memberApi.post('/api/auth/organization/set-active', {
        headers: { origin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:13000' },
        data: { organizationId: orgMember.organizationId },
      }), [200])
      await expectStatus(await memberApi.get(`/api/jobs/${fixture.job.id}`), [404])
      await expectStatus(await memberApi.post('/api/auth/organization/set-active', {
        headers: { origin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:13000' },
        data: { organizationId: orgA.organizationId },
      }), [200])
      await expectStatus(await memberApi.get(`/api/jobs/${fixture.job.id}`), [200])

      const memberCandidateResponse = await memberApi.post('/api/candidates', {
        data: {
          firstName: 'Mina',
          lastName: 'Member',
          email: `member-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
          phone: '+1 555 0199',
        },
      })
      expect(memberCandidateResponse.status()).toBe(201)
      const memberCandidate = await memberCandidateResponse.json()

      await expectStatus(await memberApi.patch(`/api/candidates/${memberCandidate.id}`, {
        data: { quickNotes: 'Member can update candidate details' },
      }), [200])

      const memberApplicationResponse = await memberApi.post('/api/applications', {
        data: {
          candidateId: memberCandidate.id,
          jobId: fixture.job.id,
          notes: 'Member-created application',
        },
      })
      expect(memberApplicationResponse.status()).toBe(201)
      const memberApplication = await memberApplicationResponse.json()

      await expectStatus(await memberApi.patch(`/api/applications/${memberApplication.id}`, {
        data: { notes: 'Member can update application notes' },
      }), [200])

      const memberCommentResponse = await memberApi.post('/api/comments', {
        data: {
          targetType: 'candidate',
          targetId: memberCandidate.id,
          body: 'Member can add a candidate comment',
        },
      })
      expect(memberCommentResponse.status()).toBe(201)
      const memberComment = await memberCommentResponse.json()

      const memberPdf = VALID_FILE_CONFIGS.find(file => file.mimeType === 'application/pdf')!
      const memberDocumentResponse = await memberApi.post(`/api/candidates/${memberCandidate.id}/documents`, {
        multipart: {
          type: 'resume',
          file: {
            name: memberPdf.filename,
            mimeType: memberPdf.mimeType,
            buffer: memberPdf.buffer,
          },
        },
      })
      expect(memberDocumentResponse.status()).toBe(201)
      const memberDocument = await memberDocumentResponse.json()

      await expectStatus(await memberApi.get(`/api/documents/${memberDocument.id}/download`), [200])
      await expectStatus(await memberApi.post('/api/jobs', {
        data: {
          title: 'Member should not create jobs',
          description: 'RBAC denial fixture',
          location: 'Remote',
          type: 'full_time',
        },
      }), [403])
      await expectStatus(await memberApi.patch(`/api/jobs/${fixture.job.id}`, {
        data: { title: 'Member should not update jobs' },
      }), [403])
      await expectStatus(await memberApi.delete(`/api/jobs/${fixture.job.id}`), [403])
      await expectStatus(await memberApi.delete(`/api/candidates/${fixture.candidate.id}`), [403])
      await expectStatus(await memberApi.delete(`/api/documents/${fixture.document.id}`), [403])
      await expectStatus(await memberApi.patch(`/api/comments/${memberComment.id}`, {
        data: { body: 'Member should not edit comments' },
      }), [403])
      await expectStatus(await memberApi.delete(`/api/comments/${memberComment.id}`), [403])
      await expectStatus(await memberApi.post('/api/invite-links', {
        data: { role: 'member', expiresInHours: 24, maxUses: 1 },
      }), [403])
      await expectStatus(await memberApi.patch('/api/org-settings', {
        data: { dateFormat: 'dmy' },
      }), [403])

      await deleteMembership(orgA.userId, orgA.organizationId)
      await expectStatus(await orgAApi.get(`/api/jobs/${fixture.job.id}`), [401, 403])
      await expectStatus(await orgAApi.get(`/api/documents/${fixture.document.id}/download`), [401, 403])
    }
    finally {
      await anonymousContext.close()
      await orgMember?.close()
      await orgB.close()
      await orgA.close()
    }
  })

  test('protects secondary admin surfaces and per-user chatbot resources @security-extended', async ({ browser }) => {
    const owner = await signUpWithOrg(browser, 'secondary-owner')
    const orgB = await signUpWithOrg(browser, 'secondary-org-b')
    const member = await signUpWithOrg(browser, 'secondary-member')
    const anonymousContext = await browser.newContext()

    try {
      const memberIdInOwnerOrg = await grantOrganizationRole(member.userId, owner.organizationId, 'member')
      const ownerApi = owner.page.context().request
      const orgBApi = orgB.page.context().request
      const memberApi = member.page.context().request
      const anonymousApi = anonymousContext.request
      const authHeaders = { origin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:13000' }

      const aiConfigResponse = await ownerApi.post('/api/ai-config', {
        data: {
          name: 'Owner AI Config',
          provider: 'openai_compatible',
          model: 'test-model',
          apiKey: 'sk-owner-config-secret',
          baseUrl: 'https://example.com/v1',
          maxTokens: 4096,
          isDefaultChatbot: true,
          isDefaultAnalysis: true,
        },
      })
      expect(aiConfigResponse.status()).toBe(201)
      const aiConfig = (await aiConfigResponse.json()).config

      const ownerAiConfig = await ownerApi.get(`/api/ai-config/${aiConfig.id}`)
      expect(ownerAiConfig.status()).toBe(200)
      const ownerAiConfigBody = await ownerAiConfig.json()
      expect(ownerAiConfigBody).toMatchObject({ id: aiConfig.id, hasApiKey: true })
      expect(JSON.stringify(ownerAiConfigBody)).not.toContain('sk-owner-config-secret')
      expect(JSON.stringify(ownerAiConfigBody)).not.toContain('apiKeyEncrypted')

      await expectStatus(await memberApi.get('/api/ai-config'), [403])
      await expectStatus(await memberApi.post('/api/ai-config', {
        data: {
          name: 'Member should not manage AI',
          provider: 'openai_compatible',
          model: 'test-model',
          apiKey: 'sk-member-config-secret',
          baseUrl: 'https://example.com/v1',
        },
      }), [403])
      await expectStatus(await memberApi.patch(`/api/ai-config/${aiConfig.id}`, {
        data: { name: 'Member should not rename AI config' },
      }), [403])
      await expectStatus(await memberApi.delete(`/api/ai-config/${aiConfig.id}`), [403])
      await expectStatus(await memberApi.post(`/api/ai-config/${aiConfig.id}/set-default`, {
        data: { purposes: ['chatbot'] },
      }), [403])
      await expectStatus(await memberApi.post(`/api/ai-config/${aiConfig.id}/test-connection`), [403])

      await expectStatus(await orgBApi.get(`/api/ai-config/${aiConfig.id}`), [404])
      await expectStatus(await orgBApi.patch(`/api/ai-config/${aiConfig.id}`, {
        data: { name: 'Cross-org AI rename' },
      }), [404])
      await expectStatus(await orgBApi.delete(`/api/ai-config/${aiConfig.id}`), [404])
      const orgBAiConfigs = await orgBApi.get('/api/ai-config')
      expect(orgBAiConfigs.status()).toBe(200)
      expect(JSON.stringify(await orgBAiConfigs.json())).not.toContain(aiConfig.id)

      await expectStatus(await anonymousApi.get('/api/ai-config'), [401, 403])

      const templateResponse = await ownerApi.post('/api/email-templates', {
        data: {
          name: 'Owner Interview Template',
          subject: 'Interview with {{organizationName}}',
          body: 'Hello {{candidateFirstName}}, let us meet about {{jobTitle}}.',
        },
      })
      expect(templateResponse.status()).toBe(201)
      const template = await templateResponse.json()

      await expectStatus(await memberApi.post('/api/email-templates', {
        data: {
          name: 'Member should not create templates',
          subject: 'Nope',
          body: 'Nope',
        },
      }), [403])
      await expectStatus(await memberApi.patch(`/api/email-templates/${template.id}`, {
        data: { subject: 'Member should not edit templates' },
      }), [403])
      await expectStatus(await memberApi.delete(`/api/email-templates/${template.id}`), [403])

      await expectStatus(await orgBApi.patch(`/api/email-templates/${template.id}`, {
        data: { subject: 'Cross-org template edit' },
      }), [404])
      await expectStatus(await orgBApi.delete(`/api/email-templates/${template.id}`), [404])
      const orgBTemplates = await orgBApi.get('/api/email-templates')
      expect(orgBTemplates.status()).toBe(200)
      expect(JSON.stringify(await orgBTemplates.json())).not.toContain(template.id)

      const providerId = `security-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const ssoProviderId = await insertSsoProvider(owner.organizationId, owner.userId, providerId)

      const ownerProviders = await ownerApi.get('/api/sso/providers')
      expect(ownerProviders.status()).toBe(200)
      expect(JSON.stringify(await ownerProviders.json())).toContain(ssoProviderId)

      await expectStatus(await memberApi.get('/api/sso/providers'), [403])
      await expectStatus(await memberApi.post('/api/sso/providers', {
        data: {
          providerId: 'member-provider',
          issuer: 'https://member-idp.example.com',
          domain: 'member-idp.example.com',
          clientId: 'client',
          clientSecret: 'secret',
        },
      }), [403])
      await expectStatus(await memberApi.delete(`/api/sso/providers/${ssoProviderId}`), [403])

      const orgBProviders = await orgBApi.get('/api/sso/providers')
      expect(orgBProviders.status()).toBe(200)
      expect(JSON.stringify(await orgBProviders.json())).not.toContain(ssoProviderId)
      await expectStatus(await orgBApi.delete(`/api/sso/providers/${ssoProviderId}`), [404])
      await expectStatus(await anonymousApi.get('/api/sso/providers'), [401, 403])

      const folderResponse = await ownerApi.post('/api/chatbot/folders', {
        data: { name: 'Owner folder', icon: 'Folder' },
      })
      expect(folderResponse.status()).toBe(200)
      const ownerFolder = (await folderResponse.json()).folder

      const agentResponse = await ownerApi.post('/api/chatbot/agents', {
        data: {
          name: 'Owner agent',
          description: 'Private owner agent',
          systemPrompt: 'Only answer from owner context.',
          temperature: 0.2,
          isDefault: true,
        },
      })
      expect(agentResponse.status()).toBe(200)
      const ownerAgent = (await agentResponse.json()).agent

      const conversationResponse = await ownerApi.post('/api/chatbot/conversations', {
        data: {
          title: 'Owner conversation',
          folderId: ownerFolder.id,
          agentId: ownerAgent.id,
          scope: { kind: 'organization' },
        },
      })
      expect(conversationResponse.status()).toBe(200)
      const ownerConversation = (await conversationResponse.json()).conversation

      const memberFolders = await memberApi.get('/api/chatbot/folders')
      expect(memberFolders.status()).toBe(200)
      expect(JSON.stringify(await memberFolders.json())).not.toContain(ownerFolder.id)
      const memberAgents = await memberApi.get('/api/chatbot/agents')
      expect(memberAgents.status()).toBe(200)
      expect(JSON.stringify(await memberAgents.json())).not.toContain(ownerAgent.id)
      const memberConversations = await memberApi.get('/api/chatbot/conversations')
      expect(memberConversations.status()).toBe(200)
      expect(JSON.stringify(await memberConversations.json())).not.toContain(ownerConversation.id)

      await expectStatus(await memberApi.patch(`/api/chatbot/folders/${ownerFolder.id}`, {
        data: { name: 'Member folder rename attempt' },
      }), [404])
      await expectStatus(await memberApi.patch(`/api/chatbot/agents/${ownerAgent.id}`, {
        data: { name: 'Member agent rename attempt' },
      }), [404])
      await expectStatus(await memberApi.get(`/api/chatbot/conversations/${ownerConversation.id}`), [404])
      await expectStatus(await memberApi.patch(`/api/chatbot/conversations/${ownerConversation.id}`, {
        data: { title: 'Member conversation rename attempt' },
      }), [404])
      await expectStatus(await memberApi.post('/api/chatbot/conversations', {
        data: {
          title: 'Member cannot use owner folder',
          folderId: ownerFolder.id,
          scope: { kind: 'organization' },
        },
      }), [404])

      const memberFolderResponse = await memberApi.post('/api/chatbot/folders', {
        data: { name: 'Member folder' },
      })
      expect(memberFolderResponse.status()).toBe(200)
      const memberFolder = (await memberFolderResponse.json()).folder

      const memberAgentResponse = await memberApi.post('/api/chatbot/agents', {
        data: {
          name: 'Member agent',
          systemPrompt: 'Answer for member-owned chats.',
        },
      })
      expect(memberAgentResponse.status()).toBe(200)
      const memberAgent = (await memberAgentResponse.json()).agent

      const memberConversationResponse = await memberApi.post('/api/chatbot/conversations', {
        data: {
          title: 'Member conversation',
          folderId: memberFolder.id,
          agentId: memberAgent.id,
          scope: { kind: 'organization' },
        },
      })
      expect(memberConversationResponse.status()).toBe(200)
      const memberConversation = (await memberConversationResponse.json()).conversation

      await expectStatus(await memberApi.patch(`/api/chatbot/conversations/${memberConversation.id}`, {
        data: { title: 'Member updated own conversation', pinned: true },
      }), [200])

      await expectStatus(await orgBApi.get(`/api/chatbot/conversations/${ownerConversation.id}`), [404])
      await expectStatus(await orgBApi.patch(`/api/chatbot/folders/${ownerFolder.id}`, {
        data: { name: 'Org B folder rename attempt' },
      }), [404])
      await expectStatus(await orgBApi.delete(`/api/chatbot/agents/${ownerAgent.id}`), [404])
      await expectStatus(await anonymousApi.get('/api/chatbot/folders'), [401, 403])

      const ownerMembers = await ownerApi.get(`/api/auth/organization/list-members?organizationId=${owner.organizationId}`)
      expect(ownerMembers.status()).toBe(200)
      expect(JSON.stringify(await ownerMembers.json())).toContain(memberIdInOwnerOrg)

      await expectStatus(await memberApi.post('/api/auth/organization/update-member-role', {
        headers: authHeaders,
        data: {
          memberId: memberIdInOwnerOrg,
          organizationId: owner.organizationId,
          role: 'admin',
        },
      }), [403])
      await expectStatus(await memberApi.post('/api/auth/organization/remove-member', {
        headers: authHeaders,
        data: {
          memberIdOrEmail: memberIdInOwnerOrg,
          organizationId: owner.organizationId,
        },
      }), [401, 403])
      await expectStatus(await orgBApi.get(`/api/auth/organization/list-members?organizationId=${owner.organizationId}`), [403])

      await expectStatus(await memberApi.delete(`/api/chatbot/conversations/${memberConversation.id}`), [200])
      await expectStatus(await memberApi.delete(`/api/chatbot/agents/${memberAgent.id}`), [200])
      await expectStatus(await memberApi.delete(`/api/chatbot/folders/${memberFolder.id}`), [200])
      await expectStatus(await ownerApi.delete(`/api/chatbot/conversations/${ownerConversation.id}`), [200])
      await expectStatus(await ownerApi.delete(`/api/chatbot/agents/${ownerAgent.id}`), [200])
      await expectStatus(await ownerApi.delete(`/api/chatbot/folders/${ownerFolder.id}`), [200])
      await expectStatus(await ownerApi.delete(`/api/sso/providers/${ssoProviderId}`), [200])
      await expectStatus(await ownerApi.delete(`/api/email-templates/${template.id}`), [204])
      await expectStatus(await ownerApi.delete(`/api/ai-config/${aiConfig.id}`), [200])
    }
    finally {
      await anonymousContext.close()
      await member.close()
      await orgB.close()
      await owner.close()
    }
  })

  test('enforces invite-link authentication, max-use, revocation, and expiration @security-extended', async ({ browser }) => {
    const owner = await signUpWithOrg(browser, 'invite-owner')
    const inviteeOne = await signUpWithOrg(browser, 'invitee-one')
    const inviteeTwo = await signUpWithOrg(browser, 'invitee-two')
    const anonymousContext = await browser.newContext()

    try {
      const ownerApi = owner.page.context().request
      const inviteeOneApi = inviteeOne.page.context().request
      const inviteeTwoApi = inviteeTwo.page.context().request
      const anonymousApi = anonymousContext.request

      const limitedLinkResponse = await ownerApi.post('/api/invite-links', {
        data: { role: 'member', expiresInHours: 24, maxUses: 1 },
      })
      expect(limitedLinkResponse.status()).toBe(201)
      const limitedLink = await limitedLinkResponse.json()

      const limitedLinkInfoResponse = await anonymousApi.get(`/api/invite-links/info/${limitedLink.token}`)
      expect(limitedLinkInfoResponse.status()).toBe(200)
      const limitedLinkInfo = await limitedLinkInfoResponse.json()
      expect(limitedLinkInfo).toMatchObject({
        organizationName: expect.any(String),
        role: 'member',
      })
      expect(JSON.stringify(limitedLinkInfo)).not.toContain(limitedLink.token)

      await expectStatus(await anonymousApi.post('/api/invite-links/accept', {
        data: { token: limitedLink.token },
      }), [401])

      const firstAcceptResponse = await inviteeOneApi.post('/api/invite-links/accept', {
        data: { token: limitedLink.token },
      })
      expect(firstAcceptResponse.status()).toBe(200)
      await expect(firstAcceptResponse.json()).resolves.toMatchObject({
        success: true,
        organizationId: owner.organizationId,
        role: 'member',
      })

      await expectStatus(await inviteeTwoApi.post('/api/invite-links/accept', {
        data: { token: limitedLink.token },
      }), [410])
      await expectStatus(await anonymousApi.get(`/api/invite-links/info/${limitedLink.token}`), [410])

      const revokedLinkResponse = await ownerApi.post('/api/invite-links', {
        data: { role: 'member', expiresInHours: 24, maxUses: 5 },
      })
      expect(revokedLinkResponse.status()).toBe(201)
      const revokedLink = await revokedLinkResponse.json()

      await expectStatus(await ownerApi.delete(`/api/invite-links/${revokedLink.id}`), [200])
      await expectStatus(await anonymousApi.get(`/api/invite-links/info/${revokedLink.token}`), [404])
      await expectStatus(await inviteeTwoApi.post('/api/invite-links/accept', {
        data: { token: revokedLink.token },
      }), [404])

      const expiredLinkResponse = await ownerApi.post('/api/invite-links', {
        data: { role: 'member', expiresInHours: 1, maxUses: 5 },
      })
      expect(expiredLinkResponse.status()).toBe(201)
      const expiredLink = await expiredLinkResponse.json()
      await expireInviteLink(expiredLink.id)

      await expectStatus(await anonymousApi.get(`/api/invite-links/info/${expiredLink.token}`), [404])
      await expectStatus(await inviteeTwoApi.post('/api/invite-links/accept', {
        data: { token: expiredLink.token },
      }), [404])
    }
    finally {
      await anonymousContext.close()
      await inviteeTwo.close()
      await inviteeOne.close()
      await owner.close()
    }
  })
})
