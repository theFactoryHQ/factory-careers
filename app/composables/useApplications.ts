import type { Ref } from 'vue'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import type { PropertyFilter } from '~~/shared/properties'

export type ApplicationsListQuery = {
  page?: number
  limit?: number
  jobId?: string
  candidateId?: string
  status?: string
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
  if (query.propertyFilters) normalized.propertyFilters = query.propertyFilters
  return `applications-${JSON.stringify(normalized)}`
}

/** Refresh every cached /api/applications list payload. */
export async function refreshApplicationsListCaches() {
  const nuxtApp = useNuxtApp()
  const keys = new Set<string>([
    ...Object.keys(nuxtApp.payload.data),
    ...Object.keys(nuxtApp.static.data),
  ])

  const refreshKeys = [...keys].filter(key => key.startsWith('applications-'))
  await Promise.all(refreshKeys.map(key => refreshNuxtData(key)))
}

/**
 * Composable for managing the applications list with filtering, pagination, and mutations.
 * Wraps `useFetch('/api/applications')` with canonical cache keys and client SWR.
 */
export function useApplications(options?: {
  page?: Ref<number | undefined> | number
  limit?: Ref<number | undefined> | number
  jobId?: Ref<string | undefined> | string
  candidateId?: Ref<string | undefined> | string
  status?: Ref<string | undefined> | string
  propertyFilters?: Ref<PropertyFilter[] | undefined> | PropertyFilter[]
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
      ...(pf && pf.length > 0 && { propertyFilters: JSON.stringify(pf) }),
    }
  })

  const { data, status: fetchStatus, error, refresh } = useFetch('/api/applications', {
    key: computed(() => applicationsListKey(query.value)),
    query,
    headers: useRequestHeaders(['cookie']),
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
      await refreshApplicationsListCaches()
      return created
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  return {
    applications,
    total,
    fetchStatus,
    error,
    refresh,
    createApplication,
  }
}