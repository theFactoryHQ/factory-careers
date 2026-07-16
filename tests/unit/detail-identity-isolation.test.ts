import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, toValue } from 'vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function stubNuxtFetch(response: ReturnType<typeof ref>) {
  const refresh = vi.fn(async () => undefined)
  vi.stubGlobal('useFetch', vi.fn(() => ({
    data: response,
    status: ref('success'),
    error: ref(null),
    refresh,
  })))
  return { refresh }
}

function stubComposableGlobals() {
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('toValue', toValue)
  vi.stubGlobal('useRequestHeaders', vi.fn(() => ({})))
  vi.stubGlobal('getSwrCachedData', vi.fn())
  vi.stubGlobal('watchFetchSwrStamp', vi.fn())
  vi.stubGlobal('refreshApplicationsListCaches', vi.fn(async () => undefined))
  vi.stubGlobal('refreshNuxtData', vi.fn(async () => undefined))
  vi.stubGlobal('clearNuxtData', vi.fn())
  vi.stubGlobal('navigateTo', vi.fn(async () => undefined))
  vi.stubGlobal('useLocalePath', vi.fn(() => (path: string) => path))
  vi.stubGlobal('useState', vi.fn((_key: string, init: () => unknown) => ref(init())))
  vi.stubGlobal('usePreviewReadOnly', vi.fn(() => ({
    handlePreviewReadOnlyError: vi.fn(() => false),
  })))
}

describe('detail fetch identity isolation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('hides a delayed application A response after switching to B and refreshes only A after its mutation', async () => {
    stubComposableGlobals()
    const applicationId = ref('app_A')
    const response = ref<any>({ id: 'app_A', notes: 'A notes' })
    stubNuxtFetch(response)
    const patch = deferred<any>()
    const fetchMock = vi.fn(() => patch.promise)
    vi.stubGlobal('$fetch', fetchMock)

    const { useApplication } = await import('../../app/composables/useApplication')
    const state = useApplication(applicationId)

    expect(state.application.value?.id).toBe('app_A')
    const update = state.updateApplication({ notes: 'Pending A notes' })
    expect(fetchMock).toHaveBeenCalledWith('/api/applications/app_A', expect.objectContaining({
      method: 'PATCH',
      body: { notes: 'Pending A notes' },
    }))

    applicationId.value = 'app_B'
    await nextTick()
    expect(state.application.value).toBeNull()

    response.value = { id: 'app_A', notes: 'Delayed A notes' }
    await nextTick()
    expect(state.application.value).toBeNull()

    patch.resolve({ id: 'app_A' })
    await update
    expect(refreshNuxtData).toHaveBeenCalledWith('application-app_A')
    expect(fetchMock).not.toHaveBeenCalledWith('/api/applications/app_B', expect.anything())

    response.value = { id: 'app_B', notes: 'B notes' }
    await nextTick()
    expect(state.application.value?.id).toBe('app_B')
  })

  it('hides delayed candidate A data and keeps update/delete cleanup bound to A after switching to B', async () => {
    stubComposableGlobals()
    const candidateId = ref('candidate_A')
    const response = ref<any>({ id: 'candidate_A', firstName: 'Alice' })
    stubNuxtFetch(response)
    const updatePatch = deferred<any>()
    const deletePatch = deferred<any>()
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => updatePatch.promise)
      .mockImplementationOnce(() => deletePatch.promise)
    vi.stubGlobal('$fetch', fetchMock)

    const { useCandidate } = await import('../../app/composables/useCandidate')
    const state = useCandidate(candidateId)

    const update = state.updateCandidate({ firstName: 'Updated Alice' })
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/candidates/candidate_A', expect.objectContaining({
      method: 'PATCH',
    }))

    candidateId.value = 'candidate_B'
    await nextTick()
    expect(state.candidate.value).toBeNull()

    updatePatch.resolve({ id: 'candidate_A' })
    await update
    expect(refreshNuxtData).toHaveBeenCalledWith('candidate-candidate_A')

    candidateId.value = 'candidate_A'
    const deletion = state.deleteCandidate()
    candidateId.value = 'candidate_B'
    deletePatch.resolve({})
    await deletion

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/candidates/candidate_A', { method: 'DELETE' })
    expect(clearNuxtData).toHaveBeenCalledWith('candidate-candidate_A')
    expect(clearNuxtData).not.toHaveBeenCalledWith('candidate-candidate_B')
  })

  it('keys application sidebars and identity-gates their dependent candidate response', () => {
    const candidatePage = readFileSync(join(process.cwd(), 'app/pages/dashboard/jobs/[id]/candidates.vue'), 'utf8')
    const sourcePage = readFileSync(join(process.cwd(), 'app/pages/dashboard/source-tracking/[id].vue'), 'utf8')
    const sidebar = readFileSync(join(process.cwd(), 'app/components/CandidateDetailSidebar.vue'), 'utf8')

    for (const source of [candidatePage, sourcePage]) {
      expect(source).toContain(':key="selectedAppId"')
    }
    expect(sidebar).toContain('fetchedCandidateData.value?.id === candidateId.value')
    expect(sidebar).toContain('resolvedCandidateData.value?.documents ?? []')
  })

  it('rejects cached application A detail and property targets immediately after selecting B', async () => {
    const cacheModule = await import('../../app/utils/application-detail-cache').catch(() => null)
    expect(cacheModule).not.toBeNull()
    if (!cacheModule) return

    const appA = { id: 'app_A', properties: [{ id: 'property_A' }] }
    const appB = { id: 'app_B', properties: [{ id: 'property_B' }] }
    const cacheA = cacheModule.cacheApplicationDetail('app_A', appA)

    expect(cacheModule.resolveApplicationDetail('app_A', appA, cacheA)).toBe(appA)
    const staleResolution = cacheModule.resolveApplicationDetail('app_B', appA, cacheA)
    expect(staleResolution).toBeNull()
    expect(staleResolution?.id).toBeUndefined()

    const resolvedB = cacheModule.resolveApplicationDetail('app_B', appB, cacheA)
    expect(resolvedB).toBe(appB)
    expect(resolvedB?.id).toBe('app_B')
  })

  it('keeps pipeline property and mutation surfaces inert until exact-ID detail is ready', () => {
    const pipeline = readFileSync(join(process.cwd(), 'app/pages/dashboard/jobs/[id]/index.vue'), 'utf8')

    expect(pipeline).toContain('type CachedApplicationDetail')
    expect(pipeline).toContain('cacheApplicationDetail(currentApplicationId.value, val)')
    expect(pipeline).toContain('cachedApplication.value?.applicationId !== currentApplicationId.value')
    expect(pipeline).toContain('v-if="!resolvedCurrentApplication"')
    expect(pipeline).toContain(':key="resolvedCurrentApplication.id"')
    expect(pipeline).toContain(':entity-id="resolvedCurrentApplication.id"')
    expect(pipeline).toContain('if (!resolvedCurrentApplication.value) return []')
    expect(pipeline).toContain('const scheduledTarget = interviewTargetApplication.value')
    expect(pipeline).toContain("await changeApplicationStatus(scheduledTarget.id, 'interview', scheduledTarget.status)")
  })
})
