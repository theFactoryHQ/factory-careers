import type { Ref } from 'vue'

export type JobsListQuery = {
  page?: number
  limit?: number
  status?: string
}

export type JobsListResponse = {
  data: Array<Record<string, unknown>>
  total: number
  page?: number
  limit?: number
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

function stampJobsListFetchedAt(data: JobsListResponse | null | undefined) {
  if (data && !(data as JobsListResponse & { _fetchedAt?: number })._fetchedAt) {
    (data as JobsListResponse & { _fetchedAt?: number })._fetchedAt = Date.now()
  }
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
    // 45s SWR cache — jobs lists are frequently visited and change infrequently within an org
    getCachedData(key, nuxtApp) {
      const cached = nuxtApp.payload.data[key]
      if (!cached) return undefined
      const fetchedAt = (cached as { _fetchedAt?: number })._fetchedAt || 0
      if (Date.now() - fetchedAt < 45_000) return cached
      return cached
    },
  })

  if (import.meta.client) {
    watch(data, (val) => {
      stampJobsListFetchedAt(val)
    }, { immediate: true })
  }

  const jobs = computed(() => data.value?.data ?? [])
  const total = computed(() => data.value?.total ?? 0)

  /** Create a new job and refresh the list */
  async function createJob(payload: {
    title: string
    description?: string
    location?: string
    type?: 'full_time' | 'part_time' | 'contract' | 'internship'
    experienceLevel?: 'junior' | 'mid' | 'senior' | 'lead'
    remoteStatus?: 'remote' | 'hybrid' | 'onsite'
    activeFrom?: Date
    requireResume?: boolean
    requireCoverLetter?: boolean
    autoScoreOnApply?: boolean
  }) {
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
    jobs,
    total,
    fetchStatus,
    error,
    refresh,
    createJob,
    deleteJob,
  }
}

/** Shared sidebar/topbar jobs list (limit 100, all statuses). */
export function useSidebarJobs() {
  return useJobs({ limit: 100 })
}