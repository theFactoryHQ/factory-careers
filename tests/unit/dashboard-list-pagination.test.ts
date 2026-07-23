import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  fetchAllJobsPages,
} from '../../app/composables/useJobs'
import {
  candidatesListKey,
} from '../../app/composables/useCandidates'
import {
  applicationsListKey,
} from '../../app/composables/useApplications'
import { applicationQuerySchema } from '../../server/utils/schemas/application'
import { candidateQuerySchema } from '../../server/utils/schemas/candidate'
import { getListPageSummary } from '../../shared/list-pagination'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('getListPageSummary', () => {
  it('describes an empty result set', () => {
    expect(getListPageSummary(0, 1, 20)).toEqual({
      totalPages: 1,
      from: 0,
      to: 0,
    })
  })

  it.each([
    { page: 1, from: 1, to: 20 },
    { page: 2, from: 21, to: 40 },
    { page: 3, from: 41, to: 45 },
  ])('describes page $page of a 45-row result set', ({ page, from, to }) => {
    expect(getListPageSummary(45, page, 20)).toEqual({
      totalPages: 3,
      from,
      to,
    })
  })

  it('clamps the displayed range to the final valid page', () => {
    expect(getListPageSummary(45, 99, 20)).toEqual({
      totalPages: 3,
      from: 41,
      to: 45,
    })
  })

  it.each([
    { page: 0, limit: 20 },
    { page: -1, limit: 20 },
    { page: 1.5, limit: 20 },
    { page: 1, limit: 0 },
    { page: 1, limit: -20 },
    { page: 1, limit: 2.5 },
  ])('rejects invalid page/limit input: $page/$limit', ({ page, limit }) => {
    expect(() => getListPageSummary(45, page, limit)).toThrow()
  })
})

describe('dashboard list pagination contracts', () => {
  it('renders accessible shared pagination controls', () => {
    const component = readProjectFile('app/components/DashboardListPagination.vue')

    expect(component).toContain('getListPageSummary')
    expect(component).toContain('Showing')
    expect(component).toContain('Previous')
    expect(component).toContain('Next')
    expect(component).toMatch(/aria-label=/)
    expect(component).toMatch(/focus:/)
  })

  it('uses complete jobs and paginates candidate and application results', () => {
    const jobs = readProjectFile('app/pages/dashboard/jobs/index.vue')
    const candidates = readProjectFile('app/pages/dashboard/candidates/index.vue')
    const applications = readProjectFile('app/pages/dashboard/applications/index.vue')

    expect(jobs).toContain('useAllJobs()')
    expect(candidates).toMatch(/useCandidates\(\{[\s\S]*page/)
    expect(candidates).toContain('<DashboardListPagination')
    expect(candidates).toContain('const hasActiveFilters = computed')
    expect(candidates).toContain('candidates.length === 0 && !hasActiveFilters')
    expect(applications).toMatch(/useApplications\(\{[\s\S]*page/)
    expect(applications).toContain('<DashboardListPagination')
    expect(applications).toContain('useAllJobs()')
  })
})

describe('dashboard list query contracts', () => {
  it('keys candidate pages, filters, and server sort separately', () => {
    expect(candidatesListKey({})).toBe('candidates-{}')
    expect(candidatesListKey({
      page: 2,
      limit: 20,
      search: 'Ada',
      sortBy: 'name',
      sortDir: 'asc',
    })).toBe(
      'candidates-{"page":2,"limit":20,"search":"Ada","sortBy":"name","sortDir":"asc"}',
    )
  })

  it('keys application pages, filters, and server sort separately', () => {
    expect(applicationsListKey({
      page: 2,
      limit: 20,
      jobId: 'job-2',
      search: 'page two',
      sortBy: 'score',
      sortDir: 'desc',
    })).toBe(
      'applications-{"page":2,"limit":20,"jobId":"job-2","search":"page two","sortBy":"score","sortDir":"desc"}',
    )
  })

  it('accepts only closed candidate sort fields and directions', () => {
    expect(candidateQuerySchema.parse({})).toMatchObject({
      sortBy: 'created',
      sortDir: 'desc',
    })
    expect(candidateQuerySchema.parse({ sortBy: 'applications', sortDir: 'asc' }))
      .toMatchObject({ sortBy: 'applications', sortDir: 'asc' })
    expect(() => candidateQuerySchema.parse({ sortBy: 'organization_id' })).toThrow()
    expect(() => candidateQuerySchema.parse({ sortDir: 'sideways' })).toThrow()
  })

  it('accepts only closed application sort fields and directions', () => {
    expect(applicationQuerySchema.parse({})).toMatchObject({
      sortBy: 'created',
      sortDir: 'desc',
    })
    expect(applicationQuerySchema.parse({ sortBy: 'score', sortDir: 'asc' }))
      .toMatchObject({ sortBy: 'score', sortDir: 'asc' })
    expect(() => applicationQuerySchema.parse({ sortBy: 'organization_id' })).toThrow()
    expect(() => applicationQuerySchema.parse({ sortDir: 'sideways' })).toThrow()
  })

  it('maps candidate sorting to tenant-scoped SQL expressions', () => {
    const source = readProjectFile('server/api/candidates/index.get.ts')

    expect(source).toContain('eq(candidate.organizationId, orgId)')
    expect(source).toContain('eq(application.organizationId, orgId)')
    expect(source).toMatch(/switch \(query\.sortBy\)/)
    expect(source).toMatch(/case 'applications'[\s\S]*applicationCount/)
    expect(source).toMatch(/candidate\.firstName[\s\S]*candidate\.lastName/)
    expect(source).toMatch(/candidate\.id/)
    expect(source).not.toContain('sql.raw')
  })

  it('maps application sorting to joined, null-safe SQL expressions', () => {
    const source = readProjectFile('server/api/applications/index.get.ts')

    expect(source).toContain('eq(application.organizationId, orgId)')
    expect(source).toMatch(/switch \(query\.sortBy\)/)
    expect(source).toMatch(/candidate\.firstName[\s\S]*candidate\.lastName/)
    expect(source).toContain('coalesce(${application.score}, -1)')
    expect(source).toMatch(/case 'score'[\s\S]*scoreWithNullFallback/)
    expect(source).toMatch(/application\.id/)
    expect(source).not.toContain('sql.raw')
  })
})

describe('complete jobs loader', () => {
  it('fetches every bounded page once and preserves page order', async () => {
    const jobs = Array.from({ length: 205 }, (_, index) => ({
      id: `job-${index + 1}`,
    }))
    const calls: Array<{ page: number, limit: number }> = []

    const result = await fetchAllJobsPages(async (page, limit) => {
      calls.push({ page, limit })
      if (page === 2) await Promise.resolve()
      return {
        data: jobs.slice((page - 1) * limit, page * limit),
        total: jobs.length,
        page,
        limit,
      }
    })

    expect(calls).toEqual([
      { page: 1, limit: 100 },
      { page: 2, limit: 100 },
      { page: 3, limit: 100 },
    ])
    expect(result.data).toHaveLength(205)
    expect(result.data.map(job => job.id)).toEqual(jobs.map(job => job.id))
    expect(new Set(result.data.map(job => job.id)).size).toBe(205)
    expect(result).toMatchObject({ total: 205, page: 1, limit: 100 })
  })

  it('bounds remaining page concurrency by batch size', async () => {
    let active = 0
    let maxActive = 0

    await fetchAllJobsPages(async (page, limit) => {
      if (page > 1) {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 1))
        active -= 1
      }
      return {
        data: [{ id: `job-${page}` }],
        total: 501,
        page,
        limit,
      }
    }, 100, 2)

    expect(maxActive).toBe(2)
  })

  it.each([
    { pageSize: 0, batchSize: 2 },
    { pageSize: 1.5, batchSize: 2 },
    { pageSize: 100, batchSize: 0 },
    { pageSize: 100, batchSize: 1.5 },
  ])(
    'rejects non-integer loader bounds: $pageSize/$batchSize',
    async ({ pageSize, batchSize }) => {
      await expect(fetchAllJobsPages(
        async (page, limit) => ({
          data: [{ id: `job-${page}` }],
          total: 1,
          page,
          limit,
        }),
        pageSize,
        batchSize,
      )).rejects.toThrow(/positive integer/)
    },
  )
})
