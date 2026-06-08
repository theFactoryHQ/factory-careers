import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APPLICATION_STATUSES,
  emptyPipelineCounts,
} from '../../shared/application-status'
import {
  paginatedListResponse,
  paginationOffset,
  paginationQuerySchema,
} from '../../server/utils/schemas/common'
import { applicationQuerySchema } from '../../server/utils/schemas/application'
import { candidateQuerySchema } from '../../server/utils/schemas/candidate'
import { jobQuerySchema } from '../../server/utils/schemas/job'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('paginationQuerySchema', () => {
  it('applies default page and limit', () => {
    expect(paginationQuerySchema().parse({})).toEqual({ page: 1, limit: 20 })
  })

  it('coerces string query params and honors custom limits', () => {
    const schema = paginationQuerySchema({ defaultLimit: 50, maxLimit: 200 })

    expect(schema.parse({ page: '2', limit: '75' })).toEqual({ page: 2, limit: 75 })
    expect(() => schema.parse({ limit: '201' })).toThrow()
  })

  it('is composed into candidate, application, and job list schemas', () => {
    expect(candidateQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20 })
    expect(applicationQuerySchema.parse({ status: 'screening' })).toMatchObject({
      page: 1,
      limit: 20,
      status: 'screening',
    })
    expect(jobQuerySchema.parse({ status: 'open', page: '3' })).toEqual({
      page: 3,
      limit: 20,
      status: 'open',
    })
  })
})

describe('paginated list helpers', () => {
  it('computes SQL offsets from page and limit', () => {
    expect(paginationOffset(1, 20)).toBe(0)
    expect(paginationOffset(3, 25)).toBe(50)
  })

  it('builds the standard list response envelope', () => {
    expect(paginatedListResponse([{ id: 'app_1' }], 42, 2, 20)).toEqual({
      data: [{ id: 'app_1' }],
      total: 42,
      page: 2,
      limit: 20,
    })
  })
})

describe('emptyPipelineCounts', () => {
  it('returns a zeroed map for every application status', () => {
    expect(emptyPipelineCounts()).toEqual({
      new: 0,
      screening: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    })
    expect(Object.keys(emptyPipelineCounts()).sort()).toEqual([...APPLICATION_STATUSES].sort())
  })

  it('returns a fresh object on each call', () => {
    const first = emptyPipelineCounts()
    first.new = 5

    expect(emptyPipelineCounts().new).toBe(0)
  })
})

describe('epic 7 route migrations', () => {
  it('routes list handlers through shared pagination helpers', () => {
    for (const path of [
      'server/api/candidates/index.get.ts',
      'server/api/applications/index.get.ts',
      'server/api/jobs/index.get.ts',
    ]) {
      const source = readProjectFile(path)
      expect(source, path).toContain('paginationOffset')
      expect(source, path).toContain('paginatedListResponse')
    }
  })

  it('routes pipeline analytics through emptyPipelineCounts', () => {
    for (const path of [
      'server/api/jobs/index.get.ts',
      'server/api/dashboard/stats.get.ts',
      'server/api/tracking-links/[id]/stats.get.ts',
      'server/api/source-tracking/stats.get.ts',
    ]) {
      const source = readProjectFile(path)
      expect(source, path).toContain('emptyPipelineCounts')
      expect(source, path).not.toMatch(/\{\s*new:\s*0,\s*screening:\s*0/)
    }
  })
})