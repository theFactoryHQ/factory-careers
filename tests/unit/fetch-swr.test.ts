import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { attachFetchSwrStamp, getSwrCachedData, DEFAULT_FETCH_SWR_TTL_MS } from '../../app/composables/useFetchSwr'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('useFetchSwr', () => {
  it('exports shared SWR helpers with a 45s default TTL', () => {
    expect(DEFAULT_FETCH_SWR_TTL_MS).toBe(45_000)
    expect(typeof attachFetchSwrStamp).toBe('function')
    expect(typeof getSwrCachedData).toBe('function')
  })

  it('stamps fetchedAt on first attach', () => {
    const payload = { data: [] }
    attachFetchSwrStamp(payload)
    expect((payload as { _fetchedAt?: number })._fetchedAt).toBeTypeOf('number')
  })

  it('returns cached payload entries through getSwrCachedData', () => {
    const cached = { data: [{ id: '1' }], _fetchedAt: Date.now() }
    const nuxtApp = { payload: { data: { 'applications-{}': cached } } } as any

    expect(getSwrCachedData('applications-{}', nuxtApp)).toBe(cached)
    expect(getSwrCachedData('missing', nuxtApp)).toBeUndefined()

    const stale = { data: [{ id: '1' }], _fetchedAt: Date.now() - DEFAULT_FETCH_SWR_TTL_MS - 1 }
    nuxtApp.payload.data['applications-stale'] = stale
    expect(getSwrCachedData('applications-stale', nuxtApp)).toBeUndefined()
  })

  it('falls back to static payload data when payload cache is empty', () => {
    const cached = { data: [{ id: '2' }], _fetchedAt: Date.now() }
    const nuxtApp = {
      payload: { data: {} },
      static: { data: { 'jobs-{}': cached } },
    } as any

    expect(getSwrCachedData('jobs-{}', nuxtApp)).toBe(cached)
  })

  it('skips cache on explicit refresh causes so mutations refetch fresh data', () => {
    const cached = { data: [{ id: '1' }], _fetchedAt: Date.now() }
    const nuxtApp = { payload: { data: { 'candidate-1': cached } } } as any

    expect(getSwrCachedData('candidate-1', nuxtApp, { cause: 'refresh:manual' })).toBeUndefined()
    expect(getSwrCachedData('candidate-1', nuxtApp, { cause: 'refresh:hook' })).toBeUndefined()
  })
})

describe('applications cache contract', () => {
  it('uses computed applications list keys instead of a static applications key', () => {
    const useApplications = readProjectFile('app/composables/useApplications.ts')

    expect(useApplications).toContain('applicationsListKey')
    expect(useApplications).toContain('getSwrCachedData')
    expect(useApplications).toContain('watchFetchSwrStamp')
    expect(useApplications).not.toContain("key: 'applications'")
    expect(useApplications).toMatch(/key:\s*computed\(\(\)\s*=>\s*applicationsListKey/)
  })

  it('routes application cache refreshes through the applications list helper', () => {
    const useApplication = readProjectFile('app/composables/useApplication.ts')
    const useApplicationScoring = readProjectFile('app/composables/useApplicationScoring.ts')

    expect(useApplication).toContain('refreshApplicationsListCaches')
    expect(useApplicationScoring).toContain('refreshApplicationsListCaches')
    expect(useApplication).not.toContain("refreshNuxtData('applications')")
  })
})

describe('org settings SWR', () => {
  it('uses shared SWR helpers for org-settings fetch', () => {
    const useOrgSettings = readProjectFile('app/composables/useOrgSettings.ts')

    expect(useOrgSettings).toContain('getSwrCachedData')
    expect(useOrgSettings).toContain('watchFetchSwrStamp')
  })
})

describe('job pipeline applications fetch', () => {
  it('routes pipeline applications through useApplications instead of pipeline-apps keys', () => {
    const pipelinePage = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(pipelinePage).toContain('useApplications')
    expect(pipelinePage).not.toContain('pipeline-apps-')
  })
})

describe('detail composable SWR', () => {
  const detailComposables = [
    'app/composables/useJob.ts',
    'app/composables/useApplication.ts',
    'app/composables/useCandidate.ts',
  ]

  it.each(detailComposables)('%s wires shared SWR helpers', (file) => {
    const source = readProjectFile(file)
    expect(source).toContain('getSwrCachedData')
    expect(source).toContain('watchFetchSwrStamp')
  })
})