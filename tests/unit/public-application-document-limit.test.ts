import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('public application document limit handling', () => {
  it('checks candidate document capacity before creating application side effects', () => {
    const route = readProjectFile('server/api/public/jobs/[slug]/apply.post.ts')
    const source = readProjectFile('server/utils/createPublicApplication.ts')
    const transactionBody = source.slice(source.indexOf('export async function createPublicApplication'))

    const limitCheckIndex = transactionBody.indexOf('existingDocumentCount + input.documents.length > input.maxDocumentsPerCandidate')
    const applicationInsertIndex = transactionBody.indexOf('tx.insertApplication')
    const complianceInsertIndex = transactionBody.indexOf('tx.insertComplianceResponse')
    const questionResponseInsertIndex = transactionBody.indexOf('tx.insertQuestionResponses')
    const documentInsertIndex = transactionBody.indexOf('tx.insertDocuments')
    const lockIndex = transactionBody.indexOf('tx.lockCandidateDocuments')

    expect(limitCheckIndex).toBeGreaterThanOrEqual(0)
    expect(applicationInsertIndex).toBeGreaterThanOrEqual(0)
    expect(complianceInsertIndex).toBeGreaterThanOrEqual(0)
    expect(questionResponseInsertIndex).toBeGreaterThanOrEqual(0)
    expect(documentInsertIndex).toBeGreaterThanOrEqual(0)
    expect(lockIndex).toBeGreaterThanOrEqual(0)
    expect(lockIndex).toBeLessThan(limitCheckIndex)
    expect(limitCheckIndex).toBeLessThan(applicationInsertIndex)
    expect(limitCheckIndex).toBeLessThan(complianceInsertIndex)
    expect(limitCheckIndex).toBeLessThan(questionResponseInsertIndex)
    expect(limitCheckIndex).toBeLessThan(documentInsertIndex)
    expect(documentInsertIndex).toBeLessThan(transactionBody.indexOf('return { candidateId, applicationId }'))
    expect(route).toContain('documents: plannedDocumentUploads.map')
    expect(route).toContain('maxDocumentsPerCandidate: MAX_DOCUMENTS_PER_CANDIDATE')
    expect(route.indexOf('createPublicApplication')).toBeLessThan(route.indexOf('tx.insert(applicationSource).values'))
    expect(route).not.toContain('db.insert(document).values')
    expect(route.indexOf('for (const plannedDocument of plannedDocumentUploads)')).toBeLessThan(route.indexOf('await db.transaction(async (tx) =>'))
    expect(route).toContain('await tx.insert(applicationSource).values')
    expect(route).toContain('await tx.update(trackingLink)')

    const dashboardUpload = readProjectFile('server/api/candidates/[id]/documents/index.post.ts')
    expect(dashboardUpload).toContain('reserveCandidateDocument')
    expect(dashboardUpload).toContain('rollbackCandidateDocumentUpload')
    expect(dashboardUpload.indexOf('reserveCandidateDocument')).toBeLessThan(dashboardUpload.indexOf('uploadToS3'))
  })
})
