import type { Ref } from 'vue'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import { remainingPageBatches } from '~~/shared/pagination'
import type { PropertyFilter } from '~~/shared/properties'

export type ApplicationsListQuery = {
  page?: number
  limit?: number
  jobId?: string
  candidateId?: string
  status?: string
  search?: string
  propertyFilters?: string
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
 * Uses canonical cache keys and client SWR. Pipeline callers can request every
 * page while the ordinary list contract remains paginated.
 */
export function useApplications(options?: {
  page?: Ref<number | undefined> | number
  limit?: Ref<number | undefined> | number
  jobId?: Ref<string | undefined> | string
  candidateId?: Ref<string | undefined> | string
  status?: Ref<string | undefined> | string
  search?: Ref<string | undefined> | string
  propertyFilters?: Ref<PropertyFilter[] | undefined> | PropertyFilter[]
  allPages?: boolean
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
    }
  })

  const requestFetch = useRequestFetch()
  const dataKey = computed(() => {
    const baseKey = applicationsListKey(query.value)
    return options?.allPages ? `${baseKey}-all-pages` : baseKey
  })

  const { data, status: fetchStatus, error, refresh } = useAsyncData(dataKey, async () => {
    const firstQuery = options?.allPages
      ? { ...query.value, page: 1 }
      : query.value
    const firstPage = await requestFetch('/api/applications', { query: firstQuery })

    if (!options?.allPages || firstPage.data.length >= firstPage.total) {
      return firstPage
    }

    const allApplications = [...firstPage.data]

    for (const pageNumbers of remainingPageBatches(firstPage.total, firstPage.limit)) {
      const pages = await Promise.all(pageNumbers.map(page => requestFetch('/api/applications', {
        query: { ...query.value, page, limit: firstPage.limit },
      })))
      allApplications.push(...pages.flatMap(page => page.data))
    }

    return { ...firstPage, data: allApplications }
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
