import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('document upload and parse failure boundaries', () => {
  it('rolls back a dashboard reservation only when S3 upload fails', () => {
    const source = read('server/api/candidates/[id]/documents/index.post.ts')
    const uploadCatch = source.indexOf('catch (uploadError)')
    const parseCall = source.indexOf('parseDocumentDetailed(')
    const rollbackCall = source.indexOf('rollbackCandidateDocumentUpload({')

    expect(source).toContain('parseResultPersistence(')
    expect(source).toContain('parseFailurePersistence(')
    expect(source).toContain('DEFAULT_DOCUMENT_PARSE_TIMEOUT_MS')
    expect(source).toMatch(/parseDocumentDetailed\(\s*fileBuffer,\s*mimeType,\s*\{ timeoutMs: DEFAULT_DOCUMENT_PARSE_TIMEOUT_MS \},?\s*\)/)
    expect(uploadCatch).toBeGreaterThan(-1)
    expect(parseCall).toBeGreaterThan(uploadCatch)
    expect(rollbackCall).toBeLessThan(parseCall)
    expect(source.slice(parseCall)).not.toContain('rollbackCandidateDocumentUpload({')
  })

  it('persists public parse outcomes and replaces fire-and-forget scoring with a durable task', () => {
    const source = read('server/api/public/jobs/[slug]/apply.post.ts')

    expect(source).toContain('parseDocumentDetailed(')
    expect(source).toContain('parseResultPersistence(')
    expect(source).toContain('parseFailurePersistence(')
    expect(source).toContain('DEFAULT_DOCUMENT_PARSE_TIMEOUT_MS')
    expect(source).toMatch(/parseDocumentDetailed\(\s*plannedDocument\.data,\s*plannedDocument\.mimeType,\s*\{ timeoutMs: DEFAULT_DOCUMENT_PARSE_TIMEOUT_MS \},?\s*\)/)
    expect(source).toContain("type: 'application_analysis'")
    expect(source).not.toContain('autoScoreApplication(')
  })
})
