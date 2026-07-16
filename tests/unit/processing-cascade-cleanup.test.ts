import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('processing-aware parent cascade cleanup', () => {
  it('provides shared candidate and job cascade preparation', () => {
    expect(existsSync(join(
      process.cwd(),
      'server/utils/processingCascadeCleanup.ts',
    ))).toBe(true)
  })

  it('routes candidate, privacy, and job cascades through processing cleanup', () => {
    const candidateRoute = read('server/api/candidates/[id].delete.ts')
    const privacy = read('server/utils/privacyRequests.ts')
    const jobRoute = read('server/api/jobs/[id].delete.ts')

    expect(candidateRoute).toContain('prepareCandidateProcessingCascadeInTransaction')
    expect(privacy).toContain('prepareCandidateProcessingCascadeInTransaction')
    expect(jobRoute).toContain('prepareJobProcessingCascadeInTransaction')
    for (const source of [candidateRoute, privacy]) {
      expect(source).not.toContain('storage_key:')
      expect(source).not.toContain('error_message:')
      expect(source).toContain("result_code: 'storage_cleanup_failed'")
    }
  })

  it('keeps surviving candidate document work active when a job is deleted', () => {
    const source = read('server/utils/processingCascadeCleanup.ts')
    const jobCleanup = source.slice(source.indexOf(
      'export async function prepareJobProcessingCascadeInTransaction',
    ))

    expect(jobCleanup).toContain("type: 'application_analysis' as const")
    expect(jobCleanup).not.toContain('cancelDocumentProcessingTasksInTransaction')
    expect(jobCleanup).not.toContain('documentIds')
  })
})
