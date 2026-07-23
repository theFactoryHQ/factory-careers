import type { Ref } from 'vue'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import type { PropertyEntry, PropertyFilter } from '~~/shared/properties'

type ApplicationsListItem = {
  id: string
  status: string
  score: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  candidateId: string
  candidateFirstName: string
  candidateLastName: string
  candidateEmail: string
  jobId: string
  jobTitle: string
  jobStatus: string
  properties: PropertyEntry[]
}

type ApplicationsListResponse = {
  data: ApplicationsListItem[]
  total: number
  page: number
  limit: number
}

export type ApplicationsListQuery = {
  page?: number
  limit?: number
  jobId?: string
  candidateId?: string
  status?: string
  search?: string
  propertyFilters?: string
  sortBy?: 'name' | 'email' | 'job' | 'status' | 'score' | 'created'
  sortDir?: 'asc' | 'desc'
}

/** Stable Nuxt payload key for a /api/applications query object. */
export function applicationsListKey(query: ApplicationsListQuery): string {
  const normalized: ApplicationsListQuery = {}
  if (query.page && query.page !== 1) normalized.page = query.page
  if (query.limit) normalized.limit = query.limit
  if (query.jobId) normalized.jobId = query.jobId
  if (query.candidateId) normalized.candidateId = query.candidateId
  if (query.status) normalized.status = query.status
  if (query.search) normalized.search = query.search
  if (query.propertyFilters) normalized.propertyFilters = query.propertyFilters
  if (query.sortBy) normalized.sortBy = query.sortBy
  if (query.sortDir) normalized.sortDir = query.sortDir
  return `applications-${JSON.stringify(normalized)}`
}

/** Invalidate inactive application-list payloads without refetching historical searches. */
export function refreshApplicationsListCaches(activeKeyToPreserve?: string) {
  clearNuxtData(key =>
    key.startsWith('applications-') && key !== activeKeyToPreserve,
  )
}

/**
 * Composable for managing the applications list with filtering, pagination, and mutations.
 * Uses canonical cache keys and client SWR. All callers remain bounded by the
 * API pagination contract; the job pipeline has its own incremental loader.
 */
export function useApplications(options?: {
  page?: Ref<number | undefined> | number
  limit?: Ref<number | undefined> | number
  jobId?: Ref<string | undefined> | string
  candidateId?: Ref<string | undefined> | string
  status?: Ref<string | undefined> | string
  search?: Ref<string | undefined> | string
  propertyFilters?: Ref<PropertyFilter[] | undefined> | PropertyFilter[]
  sortBy?: Ref<ApplicationsListQuery['sortBy']> | ApplicationsListQuery['sortBy']
  sortDir?: Ref<ApplicationsListQuery['sortDir']> | ApplicationsListQuery['sortDir']
}) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()

  const query = computed(() => {
    const pf = toValue(options?.propertyFilters)
    return {
      ...(toValue(options?.page) && { page: toValue(options?.page) }),
      ...(toValue(options?.limit) && { limit: toValue(options?.limit) }),
      ...(toValue(options?.jobId) && { jobId: toValue(options?.jobId) }),
      ...(toValue(options?.candidateId) && { candidateId: toValue(options?.candidateId) }),
      ...(toValue(options?.status) && { status: toValue(options?.status) }),
      ...(toValue(options?.search) && { search: toValue(options?.search) }),
      ...(pf && pf.length > 0 && { propertyFilters: JSON.stringify(pf) }),
      ...(toValue(options?.sortBy) && { sortBy: toValue(options?.sortBy) }),
      ...(toValue(options?.sortDir) && { sortDir: toValue(options?.sortDir) }),
    }
  })

  const requestFetch = useRequestFetch()
  const dataKey = computed(() => applicationsListKey(query.value))

  const { data, status: fetchStatus, error, refresh } = useAsyncData(dataKey, async () => {
    return requestFetch<ApplicationsListResponse>('/api/applications', { query: query.value })
  }, {
    getCachedData: getSwrCachedData,
  })

  watchFetchSwrStamp(data)

  const applications = computed(() => data.value?.data ?? [])
  const total = computed(() => data.value?.total ?? 0)

  /** Create a new application (link candidate → job) and refresh the list */
  async function createApplication(payload: {
    candidateId: string
    jobId: string
    notes?: string
  }) {
    try {
      const created = await $fetch('/api/applications', {
        method: 'POST',
        body: payload,
      })
      await refresh()
      refreshApplicationsListCaches(dataKey.value)
      return created
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  return {
    data,
    applications,
    total,
    fetchStatus,
    error,
    refresh,
    createApplication,
  }
}
