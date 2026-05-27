import type { Page } from '@playwright/test'
import { test, expect, selectFactorySelectOption } from '../fixtures'

type JobFixture = {
  id: string
  slug: string
  title: string
}

type QuestionFixture = {
  id: string
  label: string
  type: string
  required: boolean
  options: string[] | null
  displayOrder: number
}

async function createJob(page: Page, title: string): Promise<JobFixture> {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: `E2E fixture for ${title}`,
      location: 'Remote',
      type: 'full_time',
      requireResume: false,
      requireCoverLetter: false,
      applicationComplianceEnabled: false,
      autoScoreOnApply: false,
    },
  })

  expect(response.status(), `Create job API returned ${response.status()}`).toBe(201)
  return await response.json() as JobFixture
}

async function createQuestion(
  page: Page,
  jobId: string,
  question: {
    label: string
    type: string
    required: boolean
    options?: string[]
    displayOrder: number
  },
): Promise<QuestionFixture> {
  const response = await page.request.post(`/api/jobs/${jobId}/questions`, { data: question })

  expect(response.status(), `Create question API returned ${response.status()}`).toBe(201)
  return await response.json() as QuestionFixture
}

async function listQuestions(page: Page, jobId: string): Promise<QuestionFixture[]> {
  const response = await page.request.get(`/api/jobs/${jobId}/questions`)
  expect(response.status(), `List questions API returned ${response.status()}`).toBe(200)
  return await response.json() as QuestionFixture[]
}

async function publishJob(page: Page, jobId: string): Promise<JobFixture> {
  const response = await page.request.patch(`/api/jobs/${jobId}`, {
    data: { status: 'open' },
  })

  expect(response.status(), `Publish job API returned ${response.status()}`).toBe(200)
  return await response.json() as JobFixture
}

function questionRow(page: Page, label: string) {
  return page.locator('.ui-list-row').filter({ hasText: label })
}

async function editQuestion(
  page: Page,
  currentLabel: string,
  next: {
    label: string
    type: string
    options?: string[]
    required?: boolean
  },
) {
  const row = questionRow(page, currentLabel)
  await expect(row).toBeVisible()
  await row.getByTitle('Edit').click()

  await page.locator('#q-label').fill(next.label)
  await page.locator('#q-type').click()
  await page.getByRole('option', { name: next.type, exact: true }).click()

  if (next.options) {
    await page.getByPlaceholder('Option 1').fill(next.options[0] ?? '')
    for (let index = 1; index < next.options.length; index += 1) {
      await page.getByRole('button', { name: 'Add option' }).click()
      await page.getByPlaceholder(`Option ${index + 1}`).fill(next.options[index] ?? '')
    }
  }

  if (next.required) {
    await page.getByRole('checkbox', { name: 'Required' }).check()
  }

  const [updateResponse] = await Promise.all([
    page.waitForResponse(
      response => response.url().includes('/questions/') && response.request().method() === 'PATCH',
      { timeout: 30_000 },
    ),
    page.getByRole('button', { name: 'Update' }).click(),
  ])
  expect(updateResponse.status(), `Update question API returned ${updateResponse.status()}`).toBe(200)
  await page.locator('#q-label').waitFor({ state: 'hidden', timeout: 10_000 })
}

async function moveQuestionUp(page: Page, label: string) {
  const row = questionRow(page, label)
  await expect(row).toBeVisible()
  const [reorderResponse] = await Promise.all([
    page.waitForResponse(
      response => response.url().includes('/questions/reorder') && response.request().method() === 'PUT',
      { timeout: 30_000 },
    ),
    row.getByTitle('Move up').click(),
  ])
  expect(reorderResponse.status(), `Reorder question API returned ${reorderResponse.status()}`).toBe(200)
}

async function deleteQuestion(page: Page, label: string) {
  const row = questionRow(page, label)
  await expect(row).toBeVisible()
  const [deleteResponse] = await Promise.all([
    page.waitForResponse(
      response => response.url().includes('/questions/') && response.request().method() === 'DELETE',
      { timeout: 30_000 },
    ),
    row.getByTitle('Delete').click(),
  ])
  expect(deleteResponse.status(), `Delete question API returned ${deleteResponse.status()}`).toBe(204)
  await expect(questionRow(page, label)).toHaveCount(0)
}

test.describe('Application form builder lifecycle', () => {
  test('persists edit, reorder, and delete changes before publishing to the public form', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const runId = `${Date.now()}-r${testInfo.retry}`
    const job = await createJob(page, `Application Form Builder ${runId}`)

    await createQuestion(page, job.id, {
      label: `Portfolio link ${runId}`,
      type: 'url',
      required: false,
      displayOrder: 0,
    })
    await createQuestion(page, job.id, {
      label: `Availability ${runId}`,
      type: 'short_text',
      required: false,
      displayOrder: 1,
    })
    await createQuestion(page, job.id, {
      label: `Deprecated question ${runId}`,
      type: 'long_text',
      required: false,
      displayOrder: 2,
    })

    await page.goto(`/dashboard/jobs/${job.id}/application-form`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Application Form' })).toBeVisible()
    await expect(questionRow(page, `Portfolio link ${runId}`)).toBeVisible()
    await expect(questionRow(page, `Availability ${runId}`)).toBeVisible()
    await expect(questionRow(page, `Deprecated question ${runId}`)).toBeVisible()

    await editQuestion(page, `Availability ${runId}`, {
      label: `Candidate availability ${runId}`,
      type: 'Single Select',
      options: ['Immediately', 'Two weeks', 'One month'],
      required: true,
    })
    await moveQuestionUp(page, `Candidate availability ${runId}`)
    await deleteQuestion(page, `Deprecated question ${runId}`)

    const updatedQuestions = await listQuestions(page, job.id)
    expect(updatedQuestions.map(question => question.label)).toEqual([
      `Candidate availability ${runId}`,
      `Portfolio link ${runId}`,
    ])
    expect(updatedQuestions[0]).toEqual(expect.objectContaining({
      type: 'single_select',
      required: true,
      options: ['Immediately', 'Two weeks', 'One month'],
    }))

    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(questionRow(page, `Candidate availability ${runId}`)).toBeVisible()
    await expect(questionRow(page, `Portfolio link ${runId}`)).toBeVisible()
    await expect(questionRow(page, `Deprecated question ${runId}`)).toHaveCount(0)

    const published = await publishJob(page, job.id)
    await page.goto(`/jobs/${published.slug}/apply`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: job.title })).toBeVisible()
    await page.getByLabel('First name').fill('Builder')
    await page.getByLabel('Last name').fill('Applicant')
    await page.getByLabel('Email').fill(`builder.applicant.${runId}@example.com`)
    await selectFactorySelectOption(page, /Country/, 'United States')
    await selectFactorySelectOption(page, /State/, 'California')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Additional questions')).toBeVisible()

    await expect(page.getByLabel(`Candidate availability ${runId}`)).toBeVisible()
    await expect(page.getByLabel(`Portfolio link ${runId}`)).toBeVisible()
    await expect(page.getByText(`Deprecated question ${runId}`)).toHaveCount(0)
    await page.getByLabel(`Candidate availability ${runId}`).selectOption('Two weeks')
    await expect(page.getByLabel(`Candidate availability ${runId}`)).toHaveValue('Two weeks')

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.indexOf(`Candidate availability ${runId}`)).toBeLessThan(
      bodyText.indexOf(`Portfolio link ${runId}`),
    )
  })
})
