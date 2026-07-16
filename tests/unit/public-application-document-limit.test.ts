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

    const limitCheckIndex = transactionBody.indexOf('existingDocumentCount + input.newDocumentCount > input.maxDocumentsPerCandidate')
    const applicationInsertIndex = transactionBody.indexOf('tx.insertApplication')
    const complianceInsertIndex = transactionBody.indexOf('tx.insertComplianceResponse')
    const questionResponseInsertIndex = transactionBody.indexOf('tx.insertQuestionResponses')

    expect(limitCheckIndex).toBeGreaterThanOrEqual(0)
    expect(applicationInsertIndex).toBeGreaterThanOrEqual(0)
    expect(complianceInsertIndex).toBeGreaterThanOrEqual(0)
    expect(questionResponseInsertIndex).toBeGreaterThanOrEqual(0)
    expect(limitCheckIndex).toBeLessThan(applicationInsertIndex)
    expect(limitCheckIndex).toBeLessThan(complianceInsertIndex)
    expect(limitCheckIndex).toBeLessThan(questionResponseInsertIndex)
    expect(route).toContain('newDocumentCount: totalNewFiles')
    expect(route).toContain('maxDocumentsPerCandidate: MAX_DOCUMENTS_PER_CANDIDATE')
    expect(route.indexOf('createPublicApplication')).toBeLessThan(route.indexOf('db.insert(applicationSource).values'))
    expect(route.indexOf('createPublicApplication')).toBeLessThan(route.indexOf('db.insert(document).values'))
  })
})
