import type { MaybeRefOrGetter } from 'vue'
import type { FactoryDivision, JobDescriptionBlock } from '~~/shared/job-listing-structure'

/**
 * Composable for a single job detail with update and delete mutations.
 * Wraps `useFetch('/api/jobs/:id')` with a reactive key.
 */
export function useJob(id: MaybeRefOrGetter<string>) {
  const localePath = useLocalePath()
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()
  const jobId = computed(() => toValue(id))

  const { data: job, status, error, refresh } = useFetch(
    () => `/api/jobs/${jobId.value}`,
    {
      key: computed(() => `job-${jobId.value}`),
      headers: useRequestHeaders(['cookie']),
      getCachedData: getSwrCachedData,
    },
  )

  watchFetchSwrStamp(job)

  function syncJobListCache(updatedJob: { id: string } & Record<string, unknown>) {
    patchJobsListCaches(updatedJob)
  }

  /** Update job fields (partial) and refresh both detail and list caches */
  async function updateJob(payload: Partial<{
    title: string
    description: string | null
    divisions?: FactoryDivision[]
    descriptionBlocks?: JobDescriptionBlock[]
    location: string | null
    type: 'full_time' | 'part_time' | 'contract' | 'internship'
    status: 'draft' | 'open' | 'closed' | 'archived'
    salaryMin: number | null
    salaryMax: number | null
    salaryCurrency: string | null
    salaryUnit: 'YEAR' | 'MONTH' | 'HOUR' | null
    salaryNegotiable: boolean
    salaryDisplayOnListing: boolean
    remoteStatus: 'remote' | 'hybrid' | 'onsite' | null
    activeFrom: Date
    validThrough: Date | null
    requireResume: boolean
    requireCoverLetter: boolean
    applicationComplianceEnabled: boolean
    includeEeo: boolean
    includeVeteran: boolean
    includeDisability: boolean
    autoScoreOnApply: boolean
    experienceLevel: 'junior' | 'mid' | 'senior' | 'lead' | null
  }>) {
    try {
      const updated = await $fetch(`/api/jobs/${jobId.value}`, {
        method: 'PATCH',
        body: payload,
      })
      syncJobListCache(updated)
      await refresh()
      await refreshJobsListCaches()
      return updated
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
  }

  /** Delete this job and navigate back to the list */
  async function deleteJob() {
    try {
      await $fetch(`/api/jobs/${jobId.value}`, { method: 'DELETE' })
    } catch (error) {
      handlePreviewReadOnlyError(error)
      throw error
    }
    await refreshJobsListCaches()
    await navigateTo(localePath('/dashboard/jobs'))
  }

  return { job, status, error, refresh, updateJob, deleteJob }
}
