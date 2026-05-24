import type { Ref } from 'vue'

/**
 * Composable for managing the jobs list with filtering, pagination, and mutations.
 * Wraps `useFetch('/api/jobs')` with a singleton key for shared state.
 */
export function useJobs(options?: {
  status?: Ref<string | undefined> | string
}) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()

  const query = computed(() => ({
    ...(toValue(options?.status) && { status: toValue(options?.status) }),
  }))

  const { data, status: fetchStatus, error, refresh } = useFetch('/api/jobs', {
    key: computed(() => `jobs-${JSON.stringify(query.value)}`), // stable per filter combination
    query,
    headers: useRequestHeaders(['cookie']),
    // 45s SWR cache — jobs lists are frequently visited and change infrequently within an org
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
