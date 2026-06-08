import type { APIRequestContext, APIResponse, Page } from '@playwright/test'
import { assertMutatingE2ESafety } from '../safety'
import { test, expect } from '../fixtures'
import { createTextPdf, INVALID_PNG } from '../fixtures/test-buffers'
import {
  createApplication,
  createCandidate,
  createJob,
  expectApiStatus,
} from '../helpers/recruiting-fixtures'

type CandidateDocument = {
  id: string
  type: string
  originalFilename: string
  mimeType: string
  parsed: boolean
}

type ActivityItem = {
  action: string
  resourceType: string
  resourceId: string
  resourceName?: string | null
  candidateName?: string | null
}

async function expectResponseStatus(response: APIResponse, expected: number, label: string) {
  const status = response.status()
  if (status !== expected) {
    throw new Error(`${label} returned ${status}: ${await response.text()}`)
  }

  expect(status, label).toBe(expected)
}

async function loadCandidateDocuments(request: APIRequestContext, candidateId: string): Promise<CandidateDocument[]> {
  const response = await request.get(`/api/candidates/${candidateId}`)
  await expectResponseStatus(response, 200, 'Candidate detail API')
  const body = await response.json() as { documents: CandidateDocument[] }
  return body.documents
}

async function createCandidateComment(request: APIRequestContext, candidateId: string, body: string) {
  const response = await request.post('/api/comments', {
    data: {
      targetType: 'candidate',
      targetId: candidateId,
      body,
    },
  })

  await expectApiStatus(response, 201, 'Create candidate comment API')
  return await response.json() as { id: string, body: string }
}

async function loadCandidateComments(request: APIRequestContext, candidateId: string) {
  const response = await request.get(`/api/comments?targetType=candidate&targetId=${candidateId}`)
  await expectResponseStatus(response, 200, 'Candidate comments API')
  return await response.json() as { data: Array<{ id: string, body: string }> }
}

async function loadCandidateTimeline(request: APIRequestContext, candidateId: string) {
  const response = await request.get(`/api/activity-log/candidate-timeline?candidateId=${candidateId}&limit=50`)
  await expectResponseStatus(response, 200, 'Candidate timeline API')
  return await response.json() as { items: ActivityItem[], candidateName: string }
}

async function expectStreamMetadata(
  request: APIRequestContext,
  url: string,
  disposition: 'inline' | 'attachment',
  filename: string,
) {
  const response = await request.get(url)
  await expectResponseStatus(response, 200, `${url} stream`)
  const headers = response.headers()
  expect(headers['content-type']).toContain('application/pdf')
  expect(headers['content-disposition']).toContain(disposition)
  expect(headers['content-disposition']).toContain(filename)
  return response
}

async function uploadPdfFromDashboard(page: Page, candidateId: string, filename: string, text: string) {
  const clientErrors: string[] = []
  page.on('pageerror', error => clientErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') clientErrors.push(message.text())
  })
  await page.goto(`/dashboard/candidates/${candidateId}`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: /Candidate|Document/i })).toBeVisible()

  const documentsTab = page.getByRole('button', { name: /^Documents \(/ })
  const uploadButton = page.getByRole('button', { name: 'Upload Document' })
  await expect(documentsTab).toBeVisible()
  await expect(async () => {
    await documentsTab.click()
    await expect(uploadButton, clientErrors.join('\n')).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })

  const uploadResponse = page.waitForResponse(
    resp =>
      resp.url().includes(`/api/candidates/${candidateId}/documents`)
      && resp.request().method() === 'POST',
    { timeout: 30_000 },
  )
  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: 'application/pdf',
    buffer: createTextPdf(text),
  })

  const response = await uploadResponse
  await expectResponseStatus(response, 201, 'Upload document API')
  await expect(page.getByText(filename)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Resume').first()).toBeVisible()
  await expect(page.getByTitle('Preview PDF')).toBeVisible()
}

async function updateCandidateFromDetailPage(
  page: Page,
  candidateId: string,
  next: Pick<CandidateRecord, 'firstName' | 'lastName' | 'email'> & { phone: string },
) {
  await page.goto(`/dashboard/candidates/${candidateId}`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Edit' }).click()
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Edit Candidate' })).toBeVisible()
  await main.getByLabel('First Name').fill(next.firstName)
  await main.getByLabel('Last Name').fill(next.lastName)
  await main.getByRole('textbox', { name: 'Email *' }).fill(next.email)
  await main.getByLabel('Phone').fill(next.phone)

  const [saveResponse] = await Promise.all([
    page.waitForResponse(
      resp => resp.url().endsWith(`/api/candidates/${candidateId}`) && resp.request().method() === 'PATCH',
      { timeout: 30_000 },
    ),
    main.getByRole('button', { name: 'Save Changes' }).click(),
  ])
  await expectResponseStatus(saveResponse, 200, 'Save candidate profile API')
  await expect(page.getByRole('heading', { name: `${next.firstName} ${next.lastName}` })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/555.*1370/).first()).toBeVisible()
}

test.describe('Candidate document management', () => {
  test('persists candidate collaboration details, documents, and timeline activity locally', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const baseURL = String(testInfo.project.use.baseURL ?? '')
    assertMutatingE2ESafety({
      env: {
        PLAYWRIGHT_BASE_URL: baseURL,
        DATABASE_URL: process.env.DATABASE_URL,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
        NUXT_PUBLIC_SITE_URL: process.env.NUXT_PUBLIC_SITE_URL,
      },
    })

    const unique = `${Date.now()}-${testInfo.retry}`
    const candidate = await createCandidate(page.request, {
      firstName: 'Document',
      lastName: 'Tester',
      email: `document-tester-${unique}@example.com`,
    })
    const job = await createJob(page.request, `Candidate collaboration ${unique}`)
    const application = await createApplication(page.request, {
      candidateId: candidate.id,
      jobId: job.id,
      notes: `Initial collaboration note ${unique}`,
    })
    expect(application.id, 'application fixture must be created for candidate timeline coverage').toBeTruthy()

    const updatedCandidate = {
      firstName: 'Collaborator',
      lastName: `Tester ${unique}`,
      email: `collaborator-tester-${unique}@example.com`,
      phone: '+1 555 010 1370',
    }
    await updateCandidateFromDetailPage(page, candidate.id, updatedCandidate)

    const candidateComment = await createCandidateComment(
      page.request,
      candidate.id,
      `Candidate collaboration comment ${unique}`,
    )
    const comments = await loadCandidateComments(page.request, candidate.id)
    expect(comments.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: candidateComment.id, body: candidateComment.body }),
    ]))

    const filename = `document-e2e-${unique}.pdf`

    await uploadPdfFromDashboard(page, candidate.id, filename, 'Document Tester Resume')

    const documents = await loadCandidateDocuments(page.request, candidate.id)
    const uploaded = documents.find(doc => doc.originalFilename === filename)
    expect(uploaded, 'Uploaded PDF should be present in the candidate detail API').toBeTruthy()
    expect(uploaded?.mimeType).toBe('application/pdf')
    expect(uploaded?.type).toBe('resume')
    expect(uploaded?.parsed).toBe(true)

    await expectStreamMetadata(
      page.request,
      `/api/documents/${uploaded!.id}/preview`,
      'inline',
      filename,
    )
    await expectStreamMetadata(
      page.request,
      `/api/documents/${uploaded!.id}/download`,
      'attachment',
      filename,
    )

    const parseResponse = await page.request.post(`/api/documents/${uploaded!.id}/parse`)
    await expectResponseStatus(parseResponse, 200, 'Parse document API')
    const parseBody = await parseResponse.json() as { parsed: boolean, wordCount: number, sourceFormat: string }
    expect(parseBody).toMatchObject({ parsed: true, sourceFormat: 'pdf' })
    expect(parseBody.wordCount).toBeGreaterThan(0)

    const rejectedResponse = await page.request.post(`/api/candidates/${candidate.id}/documents`, {
      multipart: {
        type: 'resume',
        file: {
          name: `not-a-document-${unique}.png`,
          mimeType: 'image/png',
          buffer: INVALID_PNG,
        },
      },
    })
    await expectResponseStatus(rejectedResponse, 400, 'Invalid upload API')

    const documentsAfterReject = await loadCandidateDocuments(page.request, candidate.id)
    expect(documentsAfterReject).toHaveLength(1)
    expect(documentsAfterReject[0]?.originalFilename).toBe(filename)

    await expect
      .poll(async () => {
        const timeline = await loadCandidateTimeline(page.request, candidate.id)
        return {
          candidateName: timeline.candidateName,
          hasCandidateUpdate: timeline.items.some(item =>
            item.action === 'updated'
            && item.resourceType === 'candidate'
            && item.resourceId === candidate.id
            && item.resourceName === `${updatedCandidate.firstName} ${updatedCandidate.lastName}`),
          hasCandidateComment: timeline.items.some(item =>
            item.action === 'comment_added'
            && item.resourceType === 'candidate'
            && item.resourceId === candidate.id),
          hasApplicationFixture: timeline.items.some(item =>
            item.resourceType === 'application'
            && item.resourceId === application.id
            && item.resourceName?.includes(job.title)),
        }
      }, { timeout: 10_000 })
      .toEqual({
        candidateName: `${updatedCandidate.firstName} ${updatedCandidate.lastName}`,
        hasCandidateUpdate: true,
        hasCandidateComment: true,
        hasApplicationFixture: true,
      })
  })
})
