import { describe, expect, it } from 'vitest'
import {
  cliApplicationCreateSchema,
  cliCandidateCreateSchema,
  cliInterviewScheduleSchema,
  cliJobCreateSchema,
} from '../../shared/cli-schemas'

describe('shared CLI request schemas', () => {
  it('validates core mutating payloads used by stdin automation', () => {
    expect(cliJobCreateSchema.parse({ title: 'Engineer', status: 'draft' })).toMatchObject({ title: 'Engineer' })
    expect(cliCandidateCreateSchema.parse({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' })).toMatchObject({ email: 'ada@example.com' })
    expect(cliCandidateCreateSchema.parse({ firstName: 'Ada', lastName: 'Lovelace', email: ' Ada@Example.COM ' })).toMatchObject({ email: 'ada@example.com' })
    expect(cliApplicationCreateSchema.parse({ candidateId: 'cand_1', jobId: 'job_1' })).toMatchObject({ candidateId: 'cand_1' })
    expect(cliInterviewScheduleSchema.parse({ applicationId: 'app_1', title: 'Screen', scheduledAt: new Date().toISOString() })).toMatchObject({ applicationId: 'app_1' })
  })

  it('rejects invalid representative payloads before sending requests', () => {
    expect(() => cliJobCreateSchema.parse({ title: '' })).toThrow()
    expect(() => cliCandidateCreateSchema.parse({ firstName: 'Ada', lastName: 'Lovelace', email: 'not-email' })).toThrow()
    expect(() => cliInterviewScheduleSchema.parse({ applicationId: 'app_1', title: 'Screen', scheduledAt: 'tomorrow-ish' })).toThrow()
  })
})
