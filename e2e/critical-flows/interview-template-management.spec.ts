import { rm } from 'node:fs/promises'
import { test, expect } from '../fixtures'
import { readCapturedEmails } from '../helpers/captured-emails'

const JOB_TITLE = 'Interview Template Test Job'
const INTERVIEW_TITLE = 'Template-backed screen'

test.describe('Interview template management', () => {
  test('creates, applies, edits, and deletes an interview invitation template', async ({ authenticatedPage }, testInfo) => {
    const capturePath = process.env.FACTORY_EMAIL_CAPTURE_PATH
    expect(capturePath, 'FACTORY_EMAIL_CAPTURE_PATH must be set for interview template E2E').toBeTruthy()
    expect(process.env.FACTORY_EMAIL_TEST_MODE, 'Interview template E2E must use capture mode').toBe('capture')

    await rm(capturePath!, { force: true })

    const page = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`
    const templateName = `E2E Interview Template ${unique}`
    const editedTemplateName = `${templateName} Edited`
    const templateSubject = `Custom invite for {{candidateFirstName}}: {{jobTitle}} ${unique}`
    const templateBody = [
      'Hello {{candidateFirstName}},',
      `This is the custom interview template body ${unique}.`,
      'Interview: {{interviewTitle}}',
      'Duration: {{interviewDuration}} minutes',
    ].join('\n')
    const editedSubject = `Edited template subject ${unique}`
    const jobTitle = `${JOB_TITLE} ${unique}`
    const applicant = {
      firstName: 'Template',
      lastName: 'Candidate',
      email: `interview.template.${unique}@example.com`,
    }
    const applicantName = `${applicant.firstName} ${applicant.lastName}`

    await page.goto('/dashboard/emails/templates/new', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible({ timeout: 15_000 })
    await page.getByLabel('Workflow').selectOption('interview_invitation')
    await page.getByLabel('Template Name').fill(templateName)
    await page.getByLabel('Subject Line').fill(templateSubject)
    await page.getByLabel('Email Body').fill(templateBody)

    const [createTemplateResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/email-templates') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Create Template' }).click(),
    ])
    expect(createTemplateResponse.status(), `Create template API returned ${createTemplateResponse.status()}`).toBe(201)
    const createdTemplate = await createTemplateResponse.json() as { id: string }
    expect(createdTemplate.id, 'created template id must be present').toBeTruthy()

    await expect(page).toHaveURL(new RegExp(`/dashboard/emails/templates/${createdTemplate.id}$`), { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: templateName })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Subject Line')).toHaveValue(templateSubject)
    await expect(page.getByLabel('Email Body')).toHaveValue(templateBody)

    await page.goto('/dashboard/emails/templates', { waitUntil: 'networkidle' })
    const templateRow = page.locator('.ui-list-row').filter({ hasText: templateName })
    await expect(templateRow).toBeVisible({ timeout: 15_000 })
    await expect(templateRow).toContainText(templateSubject)
    await expect(templateRow).toContainText('Interview Invitation')

    const createJobResponse = await page.request.post('/api/jobs', {
      data: {
        title: jobTitle,
        description: 'A fast E2E job for interview template scheduling.',
        location: 'Remote',
        requireResume: false,
        requireCoverLetter: false,
        applicationComplianceEnabled: false,
        autoScoreOnApply: false,
      },
    })
    expect(createJobResponse.status(), `Create job API returned ${createJobResponse.status()}`).toBe(201)
    const createdJob = await createJobResponse.json() as { id: string; slug: string }

    const publishJobResponse = await page.request.patch(`/api/jobs/${createdJob.id}`, {
      data: { status: 'open' },
    })
    expect(publishJobResponse.status(), `Publish job API returned ${publishJobResponse.status()}`).toBe(200)
    const publishedJob = await publishJobResponse.json() as { slug: string }

    const applyResponse = await page.request.post(`/api/public/jobs/${publishedJob.slug}/apply`, {
      data: {
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        email: applicant.email,
        country: 'United States',
        state: 'CA',
        responses: [],
      },
    })
    expect(applyResponse.status(), `Apply API returned ${applyResponse.status()}`).toBe(201)

    const applicationsResponse = await page.request.get(`/api/applications?jobId=${createdJob.id}&limit=10`)
    expect(applicationsResponse.status(), `Applications API returned ${applicationsResponse.status()}`).toBe(200)
    const applications = await applicationsResponse.json() as {
      data: Array<{ id: string; candidateEmail: string }>
    }
    const application = applications.data.find(item => item.candidateEmail === applicant.email)
    expect(application?.id, 'application id must be discoverable after public apply').toBeTruthy()

    await page.goto(`/dashboard/applications/${application!.id}`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: new RegExp(applicantName) })).toBeVisible({ timeout: 15_000 })
    await page.locator('.ui-panel').filter({ hasText: 'Quick actions' }).getByRole('button', { name: 'Schedule Interview' }).click()
    await expect(page.getByRole('heading', { name: 'Schedule Interview' })).toBeVisible({ timeout: 15_000 })

    await expect(page.getByRole('checkbox', { name: /Standard email/i })).toBeChecked()
    await page.getByRole('button', { name: /Standard Interview/ }).click()
    await page.getByRole('button', { name: templateName }).last().click()
    await expect(page.getByRole('button', { name: templateName }).first()).toBeVisible()

    const calendarCheckbox = page.getByRole('checkbox', { name: /Calendar|Microsoft|Google/i }).first()
    await expect(calendarCheckbox, 'calendar sync should be disabled when no provider is configured').not.toBeChecked()

    const interviewTitle = `${INTERVIEW_TITLE} ${unique}`
    await page.getByLabel('Title').fill(interviewTitle)
    await page.getByRole('button', { name: '45m' }).click()

    const [scheduleResponse, invitationResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/interviews') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.waitForResponse(
        resp => resp.url().includes('/send-invitation') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Schedule Interview' }).last().click(),
    ])
    expect(scheduleResponse.status(), `Schedule interview API returned ${scheduleResponse.status()}`).toBe(201)
    expect(invitationResponse.status(), `Send invitation API returned ${invitationResponse.status()}`).toBe(200)
    const createdInterview = await scheduleResponse.json() as { id: string; duration: number; calendarEventProvider?: string | null }
    expect(createdInterview.id, 'created interview id must be present').toBeTruthy()
    expect(createdInterview.calendarEventProvider ?? null).toBeNull()

    const interviewResponse = await page.request.get(`/api/interviews/${createdInterview.id}`)
    expect(interviewResponse.status(), `Interview detail API returned ${interviewResponse.status()}`).toBe(200)
    const persistedInterview = await interviewResponse.json() as { title: string; duration: number }
    expect(persistedInterview.title).toBe(interviewTitle)
    expect(persistedInterview.duration).toBe(45)

    await expect.poll(async () => (await readCapturedEmails(capturePath!)).length, {
      message: 'interview scheduling should capture the custom-template invitation email',
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(1)

    const invitation = (await readCapturedEmails(capturePath!))
      .find(email => email.to.includes(applicant.email) && email.subject.includes(`Custom invite for ${applicant.firstName}`))
    expect(invitation, 'candidate invitation should use the custom template subject').toBeTruthy()
    expect(invitation?.renderError, 'custom template invitation should render successfully').toBeUndefined()
    expect(invitation?.subject).toContain(`Custom invite for ${applicant.firstName}: ${jobTitle}`)
    expect(invitation?.text).toContain(`custom interview template body ${unique}`)
    expect(invitation?.text).toContain(`Interview: ${interviewTitle}`)
    expect(invitation?.text).toContain('Duration: 45 minutes')

    await page.goto(`/dashboard/emails/templates/${createdTemplate.id}`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: templateName })).toBeVisible({ timeout: 15_000 })
    await page.getByLabel('Template Name').fill(editedTemplateName)
    await page.getByLabel('Subject Line').fill(editedSubject)

    const [updateTemplateResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes(`/api/email-templates/${createdTemplate.id}`) && resp.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Save Changes' }).click(),
    ])
    expect(updateTemplateResponse.status(), `Update template API returned ${updateTemplateResponse.status()}`).toBe(200)
    await expect(page.getByRole('heading', { name: editedTemplateName })).toBeVisible({ timeout: 15_000 })

    await page.goto('/dashboard/emails/templates', { waitUntil: 'networkidle' })
    const editedTemplateRow = page.locator('.ui-list-row').filter({ hasText: editedTemplateName })
    await expect(editedTemplateRow).toBeVisible({ timeout: 15_000 })
    await expect(editedTemplateRow).toContainText(editedSubject)

    await page.goto(`/dashboard/emails/templates/${createdTemplate.id}`, { waitUntil: 'networkidle' })
    const [deleteTemplateResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes(`/api/email-templates/${createdTemplate.id}`) && resp.request().method() === 'DELETE',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Delete Template' }).click(),
    ])
    expect(deleteTemplateResponse.status(), `Delete template API returned ${deleteTemplateResponse.status()}`).toBe(204)
    await expect(page).toHaveURL(/\/dashboard\/emails\/templates$/, { timeout: 15_000 })
    await expect(page.locator('.ui-list-row').filter({ hasText: editedTemplateName })).toHaveCount(0)

    await page.goto(`/dashboard/emails/templates/${createdTemplate.id}`, { waitUntil: 'networkidle' })
    await expect(page.getByText('Template not found')).toBeVisible({ timeout: 15_000 })
  })
})
