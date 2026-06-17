import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('public application document limit handling', () => {
  it('checks candidate document capacity before creating application side effects', () => {
    const source = readProjectFile('server/api/public/jobs/[slug]/apply.post.ts')

    const limitCheckIndex = source.indexOf('existingDocCount + totalNewFiles > MAX_DOCUMENTS_PER_CANDIDATE')
    const applicationInsertIndex = source.indexOf('db.insert(application).values')
    const complianceInsertIndex = source.indexOf('db.insert(applicationComplianceResponse).values')
    const sourceInsertIndex = source.indexOf('db.insert(applicationSource).values')
    const questionResponseInsertIndex = source.indexOf('validResponses.map((r) => ({')

    expect(limitCheckIndex).toBeGreaterThanOrEqual(0)
    expect(applicationInsertIndex).toBeGreaterThanOrEqual(0)
    expect(complianceInsertIndex).toBeGreaterThanOrEqual(0)
    expect(sourceInsertIndex).toBeGreaterThanOrEqual(0)
    expect(questionResponseInsertIndex).toBeGreaterThanOrEqual(0)
    expect(limitCheckIndex).toBeLessThan(applicationInsertIndex)
    expect(limitCheckIndex).toBeLessThan(complianceInsertIndex)
    expect(limitCheckIndex).toBeLessThan(sourceInsertIndex)
    expect(limitCheckIndex).toBeLessThan(questionResponseInsertIndex)
  })
})
