import type { APIRequestContext, APIResponse, Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import { INVALID_PNG } from '../fixtures/test-buffers'

type CandidateRecord = {
  id: string
  email: string
  firstName: string
  lastName: string
}

type CandidateDocument = {
  id: string
  type: string
  originalFilename: string
  mimeType: string
  parsed: boolean
}

function createTextPdf(text: string): Buffer {
  const pdfText = text.replace(/[\\()]/g, match => `\\${match}`)
  const streamContent = `BT /F1 12 Tf 72 700 Td (${pdfText}) Tj ET`
  const chunks = ['%PDF-1.4\n']
  const offsets = [0]

  function appendObject(index: number, body: string) {
    offsets[index] = Buffer.byteLength(chunks.join(''), 'utf8')
    chunks.push(`${index} 0 obj\n${body}\nendobj\n`)
  }

  appendObject(1, '<< /Type /Catalog /Pages 2 0 R >>')
  appendObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  appendObject(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>')
  appendObject(4, [
    `<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>`,
    'stream',
    streamContent,
    'endstream',
  ].join('\n'))
  appendObject(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  const xrefOffset = Buffer.byteLength(chunks.join(''), 'utf8')
  chunks.push([
    'xref',
    '0 6',
    '0000000000 65535 f ',
    ...offsets.slice(1).map(offset => `${offset.toString().padStart(10, '0')} 00000 n `),
    'trailer',
    '<< /Size 6 /Root 1 0 R >>',
    'startxref',
    String(xrefOffset),
    '%%EOF',
  ].join('\n'))

  return Buffer.from(chunks.join(''))
}

async function expectResponseStatus(response: APIResponse, expected: number, label: string) {
  const status = response.status()
  if (status !== expected) {
    throw new Error(`${label} returned ${status}: ${await response.text()}`)
  }

  expect(status, label).toBe(expected)
}

async function expectApiStatus(response: Awaited<ReturnType<APIRequestContext['post']>>, expected: number, label: string) {
  await expectResponseStatus(response, expected, label)
}

async function createCandidate(request: APIRequestContext, candidate: Omit<CandidateRecord, 'id'>): Promise<CandidateRecord> {
  const response = await request.post('/api/candidates', {
    data: {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
    },
  })

  await expectApiStatus(response, 201, 'Create candidate API')
  return await response.json() as CandidateRecord
}

async function loadCandidateDocuments(request: APIRequestContext, candidateId: string): Promise<CandidateDocument[]> {
  const response = await request.get(`/api/candidates/${candidateId}`)
  await expectResponseStatus(response, 200, 'Candidate detail API')
  const body = await response.json() as { documents: CandidateDocument[] }
  return body.documents
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
  await page.goto(`/dashboard/candidates/${candidateId}`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: /Candidate|Document/i })).toBeVisible()

  await page.getByRole('button', { name: /^Documents/i }).click()
  await expect(page.getByRole('button', { name: 'Upload Document' })).toBeVisible()

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

test.describe('Candidate document management', () => {
  test('uploads, previews, downloads, reparses, and rejects invalid candidate documents locally', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const unique = `${Date.now()}-${testInfo.retry}`
    const candidate = await createCandidate(page.request, {
      firstName: 'Document',
      lastName: 'Tester',
      email: `document-tester-${unique}@example.com`,
    })
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
  })
})
