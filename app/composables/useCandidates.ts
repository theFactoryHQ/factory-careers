import type { Ref } from 'vue'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import type { PropertyFilter } from '~~/shared/properties'

export type CandidatesListQuery = {
  page?: number
  limit?: number
  search?: string
  gender?: string
  dobFrom?: string
  dobTo?: string
  propertyFilters?: string
  sortBy?: 'name' | 'email' | 'phone' | 'applications' | 'created'
  sortDir?: 'asc' | 'desc'
}

/** Stable Nuxt payload key for a /api/candidates query object. */
export function candidatesListKey(query: CandidatesListQuery): string {
  const normalized: CandidatesListQuery = {}
  if (query.page && query.page !== 1) normalized.page = query.page
  if (query.limit) normalized.limit = query.limit
  if (query.search) normalized.search = query.search
  if (query.gender) normalized.gender = query.gender
  if (query.dobFrom) normalized.dobFrom = query.dobFrom
  if (query.dobTo) normalized.dobTo = query.dobTo
  if (query.propertyFilters) normalized.propertyFilters = query.propertyFilters
  if (query.sortBy) normalized.sortBy = query.sortBy
  if (query.sortDir) normalized.sortDir = query.sortDir
  return `candidates-${JSON.stringify(normalized)}`
}

/**
 * Composable for managing the candidates list with search, pagination, and mutations.
 * Wraps `useFetch('/api/candidates')` with a singleton key for shared state.
 */
export function useCandidates(options?: {
  page?: Ref<number | undefined> | number
  limit?: Ref<number | undefined> | number
  search?: Ref<string | undefined> | string
  gender?: Ref<string | undefined> | string
  dobFrom?: Ref<string | undefined> | string
  dobTo?: Ref<string | undefined> | string
  propertyFilters?: Ref<PropertyFilter[] | undefined> | PropertyFilter[]
  sortBy?: Ref<CandidatesListQuery['sortBy']> | CandidatesListQuery['sortBy']
  sortDir?: Ref<CandidatesListQuery['sortDir']> | CandidatesListQuery['sortDir']
}) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()

  const query = computed(() => {
    const pf = toValue(options?.propertyFilters)
    return {
      ...(toValue(options?.page) && { page: toValue(options?.page) }),
      ...(toValue(options?.limit) && { limit: toValue(options?.limit) }),
      ...(toValue(options?.search) && { search: toValue(options?.search) }),
      ...(toValue(options?.gender) && { gender: toValue(options?.gender) }),
      ...(toValue(options?.dobFrom) && { dobFrom: toValue(options?.dobFrom) }),
      ...(toValue(options?.dobTo) && { dobTo: toValue(options?.dobTo) }),
      ...(pf && pf.length > 0 && { propertyFilters: JSON.stringify(pf) }),
      ...(toValue(options?.sortBy) && { sortBy: toValue(options?.sortBy) }),
      ...(toValue(options?.sortDir) && { sortDir: toValue(options?.sortDir) }),
    }
  })

  const { data, status: fetchStatus, error, refresh } = useFetch('/api/candidates', {
    key: computed(() => candidatesListKey(query.value)),
    query,
    headers: useRequestHeaders(['cookie']),
    getCachedData: getSwrCachedData,
  })

  watchFetchSwrStamp(data)

  const candidates = computed(() => data.value?.data ?? [])
  const total = computed(() => data.value?.total ?? 0)

  /** Create a new candidate and refresh the list */
  async function createCandidate(payload: {
    firstName: string
    lastName: string
    displayName?: string
    email: string
    phone?: string
    gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say'
    dateOfBirth?: string
  }) {
    try {
      const created = await $fetch('/api/candidates', {
        method: 'POST',
        body: payload,
      })
      await refresh()
      return created
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  /** Delete a candidate by ID and refresh the list */
  async function deleteCandidate(id: string) {
    try {
      await $fetch(`/api/candidates/${id}`, { method: 'DELETE' })
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
    await refresh()
  }

  return {
    data,
    candidates,
    total,
    fetchStatus,
    error,
    refresh,
    createCandidate,
    deleteCandidate,
  }
}
