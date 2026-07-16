import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  computed,
  effectScope,
  nextTick,
  ref,
  shallowRef,
  toValue,
  watch,
} from 'vue'
import type { JobPipelineResponse } from '../../shared/job-pipeline'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function response(id: string, page: number, total = 1): JobPipelineResponse {
  return {
    data: [{
      id,
      status: 'new',
      score: 80,
      candidateId: `candidate_${id}`,
      candidateFirstName: id,
      candidateLastName: 'Candidate',
      candidateEmail: `${id}@example.com`,
      hasScheduledInterview: false,
      createdAt: '2026-07-16T12:00:00.000Z',
      updatedAt: '2026-07-16T12:00:00.000Z',
      properties: [],
    }],
    total,
    page,
    limit: 1,
    stageCounts: { new: total, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
  }
}

function stubVueGlobals(
  fetch: ReturnType<typeof vi.fn>,
  state = new Map<string, ReturnType<typeof ref>>(),
) {
  const serverPrefetchCallbacks: Array<() => Promise<void>> = []
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('shallowRef', shallowRef)
  vi.stubGlobal('toValue', toValue)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('useRequestFetch', vi.fn(() => fetch))
  vi.stubGlobal('useState', vi.fn((key: string, init: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(init()))
    return state.get(key)
  }))
  vi.stubGlobal('useNuxtApp', vi.fn(() => ({ isHydrating: true })))
  vi.stubGlobal('onServerPrefetch', vi.fn((callback: () => Promise<void>) => {
    serverPrefetchCallbacks.push(callback)
  }))
  vi.stubGlobal('onBeforeUnmount', vi.fn())
  return { state, serverPrefetchCallbacks }
}

describe('job pipeline composable', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('fences stale filter responses and blocks incremental loading during replacement', async () => {
    const first = deferred<JobPipelineResponse>()
    const second = deferred<JobPipelineResponse>()
    const fetch = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockResolvedValueOnce(response('app_page_2', 2, 2))
    stubVueGlobals(fetch)
    const { useJobPipeline } = await import('../../app/composables/useJobPipeline')
    const stage = ref<'new' | 'screening'>('new')
    const scope = effectScope()
    const pipeline = scope.run(() => useJobPipeline({
      jobId: 'job_1',
      stage,
      limit: 1,
    }))!

    const initialRefresh = pipeline.refresh()
    expect(fetch).toHaveBeenCalledOnce()
    const firstSignal = fetch.mock.calls[0]?.[1]?.signal as AbortSignal

    stage.value = 'screening'
    await nextTick()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(firstSignal.aborted).toBe(true)

    await pipeline.loadMore()
    expect(fetch).toHaveBeenCalledTimes(2)

    second.resolve(response('app_screening', 1, 2))
    await vi.waitFor(() => expect(pipeline.applications.value.map(item => item.id)).toEqual(['app_screening']))
    first.resolve(response('app_stale_new', 1, 2))
    await initialRefresh
    expect(pipeline.applications.value.map(item => item.id)).toEqual(['app_screening'])

    await pipeline.loadMore()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(pipeline.applications.value.map(item => item.id)).toEqual(['app_screening', 'app_page_2'])
    expect(pipeline.data.value?.page).toBe(2)
    scope.stop()
  })

  it('transfers the server-prefetched first page through Nuxt payload state', async () => {
    const fetch = vi.fn().mockResolvedValue(response('app_ssr', 1))
    const payload = new Map<string, ReturnType<typeof ref>>()
    const firstRuntime = stubVueGlobals(fetch, payload)
    const { useJobPipeline } = await import('../../app/composables/useJobPipeline')
    const serverScope = effectScope()
    const serverPipeline = serverScope.run(() => useJobPipeline({
      jobId: 'job_ssr',
      stage: 'new',
      limit: 1,
    }))!

    expect(firstRuntime.serverPrefetchCallbacks).toHaveLength(1)
    await firstRuntime.serverPrefetchCallbacks[0]!()
    expect(serverPipeline.applications.value.map(item => item.id)).toEqual(['app_ssr'])
    expect(payload.size).toBeGreaterThan(0)
    serverScope.stop()

    vi.unstubAllGlobals()
    vi.resetModules()
    const clientFetch = vi.fn()
    stubVueGlobals(clientFetch, payload)
    const { useJobPipeline: useHydratedPipeline } = await import('../../app/composables/useJobPipeline')
    const clientScope = effectScope()
    const clientPipeline = clientScope.run(() => useHydratedPipeline({
      jobId: 'job_ssr',
      stage: 'new',
      limit: 1,
    }))!

    expect(clientPipeline.applications.value.map(item => item.id)).toEqual(['app_ssr'])
    expect(clientPipeline.fetchStatus.value).toBe('success')
    expect(clientFetch).not.toHaveBeenCalled()
    clientScope.stop()
  })

  it('preserves loaded pages and exposes a retryable append error', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response('app_page_1', 1, 2))
      .mockRejectedValueOnce(new Error('page two unavailable'))
      .mockResolvedValueOnce(response('app_page_2', 2, 2))
    stubVueGlobals(fetch)
    const { useJobPipeline } = await import('../../app/composables/useJobPipeline')
    const scope = effectScope()
    const pipeline = scope.run(() => useJobPipeline({
      jobId: 'job_retry',
      stage: 'new',
      limit: 1,
    }))!

    await pipeline.refresh()
    await pipeline.loadMore()
    expect(pipeline.applications.value.map(item => item.id)).toEqual(['app_page_1'])
    expect(pipeline.fetchStatus.value).toBe('success')
    expect(pipeline.error.value).toBeNull()
    expect(pipeline.appendError.value).toMatchObject({ message: 'page two unavailable' })
    expect(pipeline.hasMore.value).toBe(true)

    await pipeline.loadMore()
    expect(pipeline.appendError.value).toBeNull()
    expect(pipeline.applications.value.map(item => item.id)).toEqual(['app_page_1', 'app_page_2'])
    scope.stop()
  })

  it('rejects later-filter payload rows when remounting the original filter', async () => {
    const payload = new Map<string, ReturnType<typeof ref>>()
    const fetch = vi.fn()
      .mockResolvedValueOnce(response('app_initial_new', 1))
      .mockResolvedValueOnce({
        ...response('app_later_screening', 1),
        data: [{ ...response('app_later_screening', 1).data[0]!, status: 'screening' as const }],
      })
    stubVueGlobals(fetch, payload)
    const { useJobPipeline } = await import('../../app/composables/useJobPipeline')
    const stage = ref<'new' | 'screening'>('new')
    const firstScope = effectScope()
    const first = firstScope.run(() => useJobPipeline({ jobId: 'job_remount', stage, limit: 1 }))!

    await first.refresh()
    stage.value = 'screening'
    await nextTick()
    await vi.waitFor(() => expect(first.applications.value.map(item => item.id)).toEqual(['app_later_screening']))
    firstScope.stop()

    vi.unstubAllGlobals()
    vi.resetModules()
    const remountFetch = vi.fn().mockResolvedValue(response('app_refreshed_new', 1))
    stubVueGlobals(remountFetch, payload)
    const { useJobPipeline: useRemountedPipeline } = await import('../../app/composables/useJobPipeline')
    const remountScope = effectScope()
    const remounted = remountScope.run(() => useRemountedPipeline({
      jobId: 'job_remount',
      stage: 'new',
      limit: 1,
    }))!

    expect(remounted.applications.value).toEqual([])
    expect(remounted.fetchStatus.value).toBe('idle')
    expect(remounted.error.value).toBeNull()
    await remounted.refresh()
    expect(remounted.applications.value.map(item => item.id)).toEqual(['app_refreshed_new'])
    remountScope.stop()
  })

  it('hydrates replace-error status only for its matching fingerprint', async () => {
    const payload = new Map<string, ReturnType<typeof ref>>()
    const fetch = vi.fn().mockRejectedValue(new Error('initial pipeline unavailable'))
    const serverRuntime = stubVueGlobals(fetch, payload)
    const { useJobPipeline } = await import('../../app/composables/useJobPipeline')
    const serverScope = effectScope()
    const serverPipeline = serverScope.run(() => useJobPipeline({
      jobId: 'job_error_hydration',
      stage: 'new',
      limit: 1,
    }))!
    await serverRuntime.serverPrefetchCallbacks[0]!()
    expect(serverPipeline.fetchStatus.value).toBe('error')
    serverScope.stop()

    vi.unstubAllGlobals()
    vi.resetModules()
    const clientFetch = vi.fn()
    stubVueGlobals(clientFetch, payload)
    const { useJobPipeline: useHydratedPipeline } = await import('../../app/composables/useJobPipeline')
    const clientScope = effectScope()
    const hydrated = clientScope.run(() => useHydratedPipeline({
      jobId: 'job_error_hydration',
      stage: 'new',
      limit: 1,
    }))!

    expect(hydrated.fetchStatus.value).toBe('error')
    expect(hydrated.error.value).toMatchObject({ message: 'initial pipeline unavailable' })
    expect(clientFetch).not.toHaveBeenCalled()
    clientScope.stop()
  })
})
