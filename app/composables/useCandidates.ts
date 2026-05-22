import type { Ref } from 'vue'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import type { PropertyFilter } from '~~/shared/properties'

/**
 * Composable for managing the candidates list with search, pagination, and mutations.
 * Wraps `useFetch('/api/candidates')` with a singleton key for shared state.
 */
export function useCandidates(options?: {
  search?: Ref<string | undefined> | string
  gender?: Ref<string | undefined> | string
  dobFrom?: Ref<string | undefined> | string
  dobTo?: Ref<string | undefined> | string
  propertyFilters?: Ref<PropertyFilter[] | undefined> | PropertyFilter[]
}) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()

  const query = computed(() => {
    const pf = toValue(options?.propertyFilters)
    return {
      ...(toValue(options?.search) && { search: toValue(options?.search) }),
      ...(toValue(options?.gender) && { gender: toValue(options?.gender) }),
      ...(toValue(options?.dobFrom) && { dobFrom: toValue(options?.dobFrom) }),
      ...(toValue(options?.dobTo) && { dobTo: toValue(options?.dobTo) }),
      ...(pf && pf.length > 0 && { propertyFilters: JSON.stringify(pf) }),
    }
  })

  const { data, status: fetchStatus, error, refresh } = useFetch('/api/candidates', {
    key: computed(() => `candidates-${JSON.stringify(query.value)}`),
    query,
    headers: useRequestHeaders(['cookie']),
    // 45s SWR cache for candidate lists (very frequently accessed in dashboard)
    getCachedData(key, nuxtApp) {
      const cached = nuxtApp.payload.data[key]
      if (!cached) return undefined
      const fetchedAt = (cached as any)._fetchedAt || 0
      if (Date.now() - fetchedAt < 45_000) return cached
      return cached
    },
  })

  if (import.meta.client) {
    watch(data, (val) => {
      if (val && !(val as any)._fetchedAt) (val as any)._fetchedAt = Date.now()
    }, { immediate: true })
  }

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
    candidates,
    total,
    fetchStatus,
    error,
    refresh,
    createCandidate,
    deleteCandidate,
  }
}
