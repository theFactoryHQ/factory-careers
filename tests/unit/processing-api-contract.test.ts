import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('durable processing API contracts', () => {
  it('queues organization-wide and job-wide missing-only analysis directly from the database', () => {
    for (const path of [
      'server/api/applications/analyze-missing.post.ts',
      'server/api/jobs/[id]/analyze-all.post.ts',
    ]) {
      const source = read(path)
      expect(source).toContain('isNull(application.score)')
      expect(source).toContain("type: 'application_analysis'")
      expect(source).toContain('enqueueProcessingBatch({')
      expect(source).toContain('setResponseStatus(event, 202)')
      expect(source).toContain("setResponseHeader(event, 'Location'")
      expect(source).not.toContain('applicationIds')
    }
  })

  it('exposes tenant-scoped sanitized status and bounded batch-only draining', () => {
    for (const path of [
      'server/api/processing/[id].get.ts',
      'server/api/processing/[id]/drain.post.ts',
    ]) expect(existsSync(join(process.cwd(), path))).toBe(true)

    const status = read('server/api/processing/[id].get.ts')
    expect(status).toContain("requirePermission(event, { organization: ['read'] })")
    expect(status).toContain("setResponseHeader(event, 'Cache-Control', 'no-store')")
    expect(status).toContain('getProcessingBatchStatus({')
    expect(status).toContain('processingBatchResponse(')

    const drain = read('server/api/processing/[id]/drain.post.ts')
    expect(drain).toContain('z.number().int().min(1).max(50)')
    expect(drain).toContain('createRateLimiter({')
    expect(drain).toContain('batchId')
    expect(drain).toContain('processRecruitingTasks({')
    expect(drain).toContain("setResponseHeader(event, 'Retry-After'")

    const batchLookup = drain.indexOf('getProcessingBatchStatus({')
    const scoringPermission = drain.indexOf("requirePermission(event, { scoring: ['create'] })")
    const documentPermission = drain.indexOf("requirePermission(event, { document: ['update'] })")
    expect(scoringPermission).toBeGreaterThan(batchLookup)
    expect(documentPermission).toBeGreaterThan(batchLookup)
    expect(drain).toContain("existing.type === 'application_analysis'")
  })

  it('queues parse-all by default without retrying no-text or terminal failures', () => {
    const bulk = read('server/api/documents/parse-all.post.ts')
    expect(bulk).toContain("eq(document.parseStatus, 'pending')")
    expect(bulk).toContain("eq(document.uploadStatus, 'completed')")
    expect(bulk).toContain("type: 'document_parse'")
    expect(bulk).toContain('enqueueProcessingBatch({')

    const manual = read('server/api/documents/[id]/parse.post.ts')
    expect(manual).toContain("parseStatus: 'pending'")
    expect(manual).toContain('parseResultCode: null')
    expect(manual).toContain("type: 'document_parse'")
  })
})
