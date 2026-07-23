import type { Ref } from 'vue'
import type {
  CreateJobRequest,
  JobExperienceLevel,
  JobRemoteStatus,
  JobStatus,
  JobType,
} from '~~/shared/job-contract'
import type { FactoryDivision, JobDescriptionBlock } from '~~/shared/job-listing-structure'
import type { PipelineCounts } from '~~/shared/application-status'

export type JobsListQuery = {
  page?: number
  limit?: number
  status?: string
}

export type JobsListItem = {
  id: string
  title: string
  slug: string
  description: string | null
  divisions: FactoryDivision[]
  descriptionBlocks: JobDescriptionBlock[]
  location: string | null
  type: JobType
  status: JobStatus
  experienceLevel: JobExperienceLevel | null
  remoteStatus: JobRemoteStatus | null
  activeFrom: string
  createdAt: string
  updatedAt: string
  pipeline: PipelineCounts
}

export type JobsListResponse = {
  data: JobsListItem[]
  total: number
  page?: number
  limit?: number
}

type JobsPageFetcher<T> = (
  page: number,
  limit: number,
) => Promise<{
  data: T[]
  total: number
  page?: number
  limit?: number
}>

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer`)
  }
}

/**
 * Load every page from the bounded jobs list API while preserving API page
 * order. Remaining pages are requested in small parallel batches.
 */
export async function fetchAllJobsPages<T>(
  fetchPage: JobsPageFetcher<T>,
  pageSize = 100,
  batchSize = 4,
) {
  assertPositiveInteger(pageSize, 'pageSize')
  assertPositiveInteger(batchSize, 'batchSize')

  const firstPage = await fetchPage(1, pageSize)
  const totalPages = Math.max(1, Math.ceil(firstPage.total / pageSize))
  const pages: T[][] = [firstPage.data]

  for (let first = 2; first <= totalPages; first += batchSize) {
    const pageNumbers = Array.from(
      { length: Math.min(batchSize, totalPages - first + 1) },
      (_, index) => first + index,
    )
    const batch = await Promise.all(
      pageNumbers.map(page => fetchPage(page, pageSize)),
    )
    pages.push(...batch.map(response => response.data))
  }

  return {
    data: pages.flat(),
    total: firstPage.total,
    page: 1,
    limit: pageSize,
  }
}

/** Stable Nuxt payload key for a /api/jobs query object. */
export function jobsListKey(query: JobsListQuery): string {
  const normalized: JobsListQuery = {}
  if (query.page && query.page !== 1) normalized.page = query.page
  if (query.limit) normalized.limit = query.limit
  if (query.status) normalized.status = query.status
  return `jobs-${JSON.stringify(normalized)}`
}

function buildJobsListQuery(options?: {
  page?: Ref<number | undefined> | number
  limit?: Ref<number | undefined> | number
  status?: Ref<string | undefined> | string
}): ComputedRef<JobsListQuery> {
  return computed(() => ({
    ...(toValue(options?.page) && { page: toValue(options?.page) }),
    ...(toValue(options?.limit) && { limit: toValue(options?.limit) }),
    ...(toValue(options?.status) && { status: toValue(options?.status) }),
  }))
}

/** Patch every cached /api/jobs list payload that contains the updated job. */
export function patchJobsListCaches(updatedJob: { id: string } & Record<string, unknown>) {
  const nuxtApp = useNuxtApp()
  const stores = [nuxtApp.payload.data, nuxtApp.static.data]

  for (const store of stores) {
    for (const key of Object.keys(store)) {
      if (!key.startsWith('jobs-')) continue

      const entry = store[key] as JobsListResponse | undefined
      if (!entry?.data) continue

      store[key] = {
        ...entry,
        data: entry.data.map((item) => {
          if (item.id !== updatedJob.id) return item
          return {
            ...item,
            ...updatedJob,
            pipeline: item.pipeline,
          }
        }),
      }
    }
  }
}

/** Refresh every cached /api/jobs list payload. */
export async function refreshJobsListCaches() {
  const nuxtApp = useNuxtApp()
  const keys = new Set<string>([
    ...Object.keys(nuxtApp.payload.data),
    ...Object.keys(nuxtApp.static.data),
  ])

  const refreshKeys = [...keys].filter(key => key.startsWith('jobs-'))
  await Promise.all(refreshKeys.map(key => refreshNuxtData(key)))
}

/**
 * Composable for managing the jobs list with filtering, pagination, and mutations.
 * Wraps `useFetch('/api/jobs')` with canonical cache keys shared across dashboard consumers.
 */
export function useJobs(options?: {
  page?: Ref<number | undefined> | number
  limit?: Ref<number | undefined> | number
  status?: Ref<string | undefined> | string
  immediate?: boolean
}) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()

  const query = buildJobsListQuery(options)

  const { data, status: fetchStatus, error, refresh } = useFetch('/api/jobs', {
    key: computed(() => jobsListKey(query.value)),
    query,
    ...(options?.immediate === undefined ? {} : { immediate: options.immediate }),
    headers: useRequestHeaders(['cookie']),
    getCachedData: getSwrCachedData,
  })

  watchFetchSwrStamp(data)

  const jobs = computed(() => data.value?.data ?? [])
  const total = computed(() => data.value?.total ?? 0)

  /** Create a new job and refresh the list */
  async function createJob(payload: CreateJobRequest) {
    try {
      const created = await $fetch('/api/jobs', {
        method: 'POST',
        body: payload,
      })
      await refresh()
      await refreshJobsListCaches()
      return created
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  /** Delete a job by ID and refresh the list */
  async function deleteJob(id: string) {
    try {
      await $fetch(`/api/jobs/${id}`, { method: 'DELETE' })
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
    await refresh()
    await refreshJobsListCaches()
  }

  return {
    data,
    jobs,
    total,
    fetchStatus,
    error,
    refresh,
    createJob,
    deleteJob,
  }
}

/** Complete, cached job inventory for dashboard-wide client filtering. */
export function useAllJobs() {
  const requestFetch = useRequestFetch()
  const { data, status: fetchStatus, error, refresh } = useAsyncData(
    'jobs-all',
    () => fetchAllJobsPages(
      (page, limit) => requestFetch<JobsListResponse>('/api/jobs', {
        query: { page, limit },
      }),
    ),
    {
      getCachedData: getSwrCachedData,
    },
  )

  watchFetchSwrStamp(data)

  const jobs = computed(() => data.value?.data ?? [])
  const total = computed(() => data.value?.total ?? 0)

  return {
    data,
    jobs,
    total,
    fetchStatus,
    error,
    refresh,
  }
}

/** Shared sidebar/topbar jobs list (limit 100, all statuses). */
export function useSidebarJobs() {
  return useJobs({ limit: 100 })
}
