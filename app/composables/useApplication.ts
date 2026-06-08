import type { MaybeRefOrGetter } from 'vue'
import type { ApplicationStatus } from '~~/shared/application-status'

export type ApplicationUpdatePayload = Partial<{
  status: ApplicationStatus
  notes: string | null
  score: number | null
}>

/** PATCH `/api/applications/:id` — shared by detail surfaces and list transitions */
export async function patchApplication(applicationId: string, payload: ApplicationUpdatePayload) {
  return await $fetch(`/api/applications/${applicationId}`, {
    method: 'PATCH',
    body: payload,
  })
}

/**
 * Composable for a single application detail with update mutation.
 * Wraps `useFetch('/api/applications/:id')` with a reactive key.
 */
export function useApplication(id: MaybeRefOrGetter<string>) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()
  const applicationId = computed(() => toValue(id))

  const { data: application, status, error, refresh } = useFetch(
    () => `/api/applications/${applicationId.value}`,
    {
      key: computed(() => `application-${applicationId.value}`),
      headers: useRequestHeaders(['cookie']),
      getCachedData: getSwrCachedData,
    },
  )

  watchFetchSwrStamp(application)

  /** Update application fields (status, notes, score) and refresh caches */
  async function updateApplication(payload: ApplicationUpdatePayload) {
    try {
      const updated = await patchApplication(applicationId.value, payload)
      await refresh()
      await refreshApplicationsListCaches()
      return updated
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  return { application, status, error, refresh, updateApplication }
}
