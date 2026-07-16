import type { MaybeRefOrGetter } from 'vue'
import {
  emptyJobPipelineStageCounts,
  jobPipelineRequestFingerprint,
  mergeJobPipelinePages,
  type JobPipelineInterviewFilter,
  type JobPipelineRequest,
  type JobPipelineResponse,
  type JobPipelineScoreFilter,
  type JobPipelineSort,
} from '~~/shared/job-pipeline'
import type { ApplicationStatus } from '~~/shared/application-status'
import type { PropertyFilter } from '~~/shared/properties'

type PipelineFetchStatus = 'idle' | 'pending' | 'success' | 'error'
export type JobPipelineClientError = {
  message: string
  statusCode?: number
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
}

function normalizePipelineError(error: unknown): JobPipelineClientError {
  if (error instanceof Error) return { message: error.message }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const data = record.data && typeof record.data === 'object'
      ? record.data as Record<string, unknown>
      : undefined
    const message = data?.statusMessage ?? record.statusMessage ?? record.message
    const statusCode = data?.statusCode ?? record.statusCode
    return {
      message: typeof message === 'string' ? message : 'Failed to load pipeline applications',
      ...(typeof statusCode === 'number' && { statusCode }),
    }
  }
  return { message: 'Failed to load pipeline applications' }
}

/** Bounded, incrementally paginated data source for a single job pipeline. */
export function useJobPipeline(options: {
  jobId: MaybeRefOrGetter<string>
  stage: MaybeRefOrGetter<ApplicationStatus>
  search?: MaybeRefOrGetter<string | undefined>
  candidateSearch?: MaybeRefOrGetter<string | undefined>
  score?: MaybeRefOrGetter<JobPipelineScoreFilter>
  interviews?: MaybeRefOrGetter<JobPipelineInterviewFilter>
  sort?: MaybeRefOrGetter<JobPipelineSort>
  propertyFilters?: MaybeRefOrGetter<PropertyFilter[]>
  limit?: number
}) {
  const requestFetch = useRequestFetch()
  const query = computed<JobPipelineRequest>(() => ({
    jobId: toValue(options.jobId),
    page: 1,
    limit: options.limit ?? 25,
    stage: toValue(options.stage),
    search: toValue(options.search),
    candidateSearch: toValue(options.candidateSearch),
    score: toValue(options.score) ?? 'all',
    interviews: toValue(options.interviews) ?? 'all',
    sort: toValue(options.sort) ?? 'score-desc',
    propertyFilters: toValue(options.propertyFilters) ?? [],
  }))
  const requestFingerprint = computed(() => jobPipelineRequestFingerprint(query.value))
  const stateKey = `job-pipeline:${requestFingerprint.value}`
  const data = useState<JobPipelineResponse | null>(`${stateKey}:data`, () => null)
  const fetchStatus = useState<PipelineFetchStatus>(`${stateKey}:status`, () => 'idle')
  const error = useState<JobPipelineClientError | null>(`${stateKey}:error`, () => null)
  const loadedFingerprint = useState<string | null>(`${stateKey}:loaded-fingerprint`, () => null)
  const stateFingerprint = useState<string | null>(`${stateKey}:state-fingerprint`, () => null)
  const appendError = shallowRef<JobPipelineClientError | null>(null)
  const isLoadingMore = ref(false)
  const nuxtApp = useNuxtApp()
  let requestGeneration = 0
  let activeController: AbortController | null = null

  // A fixed payload key can outlive this component after client navigation.
  // Never render rows/status produced by a different filter fingerprint.
  if (loadedFingerprint.value !== requestFingerprint.value) {
    data.value = null
    loadedFingerprint.value = null
  }
  if (stateFingerprint.value !== requestFingerprint.value) {
    fetchStatus.value = 'idle'
    error.value = null
    stateFingerprint.value = null
  }

  function requestQuery(request: JobPipelineRequest, page: number) {
    return {
      page,
      limit: request.limit,
      stage: request.stage,
      ...(request.search && { search: request.search }),
      ...(request.candidateSearch && { candidateSearch: request.candidateSearch }),
      score: request.score,
      interviews: request.interviews,
      sort: request.sort,
      ...(Array.isArray(request.propertyFilters) && request.propertyFilters.length > 0
        ? { propertyFilters: JSON.stringify(request.propertyFilters) }
        : {}),
    }
  }

  async function fetchPage(page: number, mode: 'replace' | 'append') {
    const request = { ...query.value }
    if (!request.jobId) return
    if (mode === 'replace') requestGeneration += 1
    const generation = requestGeneration
    const fingerprint = jobPipelineRequestFingerprint(request)
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    if (mode === 'append') {
      appendError.value = null
      isLoadingMore.value = true
    }
    else {
      stateFingerprint.value = fingerprint
      error.value = null
      appendError.value = null
      isLoadingMore.value = false
      if (loadedFingerprint.value !== fingerprint) {
        data.value = null
        loadedFingerprint.value = null
      }
      fetchStatus.value = 'pending'
    }

    try {
      const result = await requestFetch<JobPipelineResponse>(
        `/api/jobs/${encodeURIComponent(request.jobId)}/pipeline`,
        { query: requestQuery(request, page), signal: controller.signal },
      )
      if (
        controller.signal.aborted
        || generation !== requestGeneration
        || fingerprint !== requestFingerprint.value
      ) return

      data.value = mode === 'append' && data.value
        ? mergeJobPipelinePages(data.value, result)
        : result
      loadedFingerprint.value = fingerprint
      stateFingerprint.value = fingerprint
      if (mode === 'replace') fetchStatus.value = 'success'
    }
    catch (caught) {
      if (isAbortError(caught) || controller.signal.aborted) return
      if (generation !== requestGeneration || fingerprint !== requestFingerprint.value) return
      if (mode === 'append') {
        appendError.value = normalizePipelineError(caught)
      }
      else {
        error.value = normalizePipelineError(caught)
        fetchStatus.value = 'error'
      }
    }
    finally {
      if (activeController === controller) activeController = null
      if (generation === requestGeneration && fingerprint === requestFingerprint.value) {
        isLoadingMore.value = false
      }
    }
  }

  async function refresh() {
    await fetchPage(1, 'replace')
  }

  async function loadMore() {
    if (
      !data.value
      || loadedFingerprint.value !== requestFingerprint.value
      || fetchStatus.value === 'pending'
      || isLoadingMore.value
      || data.value.data.length >= data.value.total
    ) return
    await fetchPage(data.value.page + 1, 'append')
  }

  watch(requestFingerprint, () => {
    void refresh()
  }, { immediate: import.meta.client && !nuxtApp.isHydrating })
  onServerPrefetch(refresh)
  onBeforeUnmount(() => activeController?.abort())

  return {
    data,
    applications: computed(() => data.value?.data ?? []),
    total: computed(() => data.value?.total ?? 0),
    stageCounts: computed(() => data.value?.stageCounts ?? emptyJobPipelineStageCounts()),
    hasMore: computed(() => Boolean(
      fetchStatus.value !== 'pending'
      && data.value
      && data.value.data.length < data.value.total,
    )),
    fetchStatus,
    error,
    appendError,
    isLoadingMore,
    refresh,
    loadMore,
  }
}
