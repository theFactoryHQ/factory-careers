import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('interview list tenant scope', () => {
  it('organization-shapes every joined interview entity in data and count queries', () => {
    const source = readFileSync(
      join(process.cwd(), 'server/api/interviews/index.get.ts'),
      'utf8',
    )

    expect(source.match(/eq\(application\.organizationId, orgId\)/g)).toHaveLength(2)
    expect(source.match(/eq\(candidate\.organizationId, orgId\)/g)).toHaveLength(2)
    expect(source.match(/eq\(job\.organizationId, orgId\)/g)).toHaveLength(2)
    expect(source).not.toContain('.innerJoin(application, eq(application.id, interview.applicationId))')
    expect(source).not.toContain('.innerJoin(candidate, eq(candidate.id, application.candidateId))')
    expect(source).not.toContain('.innerJoin(job, eq(job.id, application.jobId))')
  })
})
