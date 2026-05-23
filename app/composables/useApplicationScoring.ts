type ScoreApplicationOptions = {
  refresh?: () => Promise<unknown> | unknown
  jobId?: string
  source?: string
}

export function useApplicationScoring() {
  const toast = useToast()
  const { track } = useTrack()
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()
  const isScoringApplication = ref(false)

  async function scoreApplicationCandidate(applicationId: string, options: ScoreApplicationOptions = {}) {
    isScoringApplication.value = true
    try {
      await $fetch(`/api/applications/${applicationId}/analyze`, {
        method: 'POST',
        headers: useRequestHeaders(['cookie']),
      })

      await options.refresh?.()
      await refreshNuxtData('applications')
      if (options.jobId) {
        await refreshNuxtData(`pipeline-apps-${options.jobId}`)
      }

      track('individual_scoring_completed', {
        application_id: applicationId,
        source: options.source ?? 'application_detail',
      })
      toast.success('Candidate scored', 'AI analysis complete.')
    } catch (err: any) {
      if (handlePreviewReadOnlyError(err)) return

      const statusMessage = err?.data?.statusMessage ?? ''
      if (statusMessage.includes('AI provider not configured')) {
        toast.add({
          type: 'warning',
          title: 'AI provider not configured',
          message: 'Set up your AI provider in Settings first.',
          link: { label: 'Go to AI Settings', href: '/dashboard/settings/ai' },
          duration: 8000,
        })
      } else if (statusMessage.includes('No scoring criteria')) {
        toast.warning('No scoring criteria', 'Add scoring criteria to this job first.')
      } else if (statusMessage.includes('No resume') || statusMessage.includes('Resume was uploaded')) {
        toast.warning('Resume required', statusMessage)
      } else {
        toast.error('Scoring failed', {
          message: statusMessage || 'An unexpected error occurred.',
          statusCode: err?.data?.statusCode,
        })
      }
    } finally {
      isScoringApplication.value = false
    }
  }

  return { isScoringApplication, scoreApplicationCandidate }
}
