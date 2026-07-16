import type { MaybeRefOrGetter } from 'vue'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

/**
 * Composable for a single candidate detail with update and delete mutations.
 * Wraps `useFetch('/api/candidates/:id')` with a reactive key.
 */
function invalidateCandidatesListCache() {
  clearNuxtData(key => key.startsWith('candidates-'))
}

export function useCandidate(id: MaybeRefOrGetter<string>) {
  const localePath = useLocalePath()
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()
  const candidateId = computed(() => toValue(id))

  const { data: fetchedCandidate, status, error, refresh } = useFetch(
    () => `/api/candidates/${candidateId.value}`,
    {
      key: computed(() => `candidate-${candidateId.value}`),
      headers: useRequestHeaders(['cookie']),
      getCachedData: getSwrCachedData,
    },
  )

  watchFetchSwrStamp(fetchedCandidate)

  const candidate = computed(() => (
    fetchedCandidate.value?.id === candidateId.value
      ? fetchedCandidate.value
      : null
  ))

  /** Update candidate fields (partial) and refresh both detail and list caches */
  async function updateCandidate(payload: Partial<{
    firstName: string
    lastName: string
    displayName: string | null
    email: string
    phone: string | null
    gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null
    dateOfBirth: string | null
  }>) {
    const targetCandidateId = candidateId.value
    try {
      const updated = await $fetch(`/api/candidates/${targetCandidateId}`, {
        method: 'PATCH',
        body: payload,
      })
      await refreshNuxtData(`candidate-${targetCandidateId}`)
      await invalidateCandidatesListCache()
      return updated
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  /** Delete this candidate and navigate back to the list */
  async function deleteCandidate() {
    const targetCandidateId = candidateId.value
    try {
      await $fetch(`/api/candidates/${targetCandidateId}`, { method: 'DELETE' })
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
    await invalidateCandidatesListCache()
    clearNuxtData(`candidate-${targetCandidateId}`)
    clearNuxtData(key => key.startsWith('applications-'))
    await navigateTo(localePath('/dashboard/candidates'))
  }

  return { candidate, status, error, refresh, updateCandidate, deleteCandidate }
}
