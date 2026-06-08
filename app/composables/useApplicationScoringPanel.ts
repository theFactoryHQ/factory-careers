import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

type ApplicationScoringTarget = {
  score: number | null
  job: {
    id: string
  }
}

type UseApplicationScoringPanelOptions = {
  applicationId: MaybeRefOrGetter<string>
  application: MaybeRefOrGetter<ApplicationScoringTarget | null | undefined>
  source: string
  refreshApplication?: boolean
  refresh?: () => Promise<unknown> | unknown
}

export function useApplicationScoringPanel(options: UseApplicationScoringPanelOptions) {
  const application = computed(() => toValue(options.application))

  const {
    scoringData,
    refreshScoring,
    scoringSummary,
    scoringSummaryFallback,
    scoreBand,
  } = useApplicationScoringData({
    applicationId: options.applicationId,
    applicationScore: computed(() => application.value?.score),
  })

  const { isScoringApplication, scoreApplicationCandidate } = useApplicationScoring()

  async function scoreCurrentApplication() {
    const currentApplication = application.value
    if (!currentApplication) return

    const refreshApplication = options.refreshApplication ?? true
    const result = await scoreApplicationCandidate(toValue(options.applicationId), {
      refreshApplication,
      refresh: options.refresh,
      jobId: currentApplication.job.id,
      source: options.source,
    })

    if (result && !refreshApplication && currentApplication) {
      currentApplication.score = result.compositeScore
    }

    await refreshScoring()
  }

  return {
    scoringData,
    refreshScoring,
    scoringSummary,
    scoringSummaryFallback,
    scoreBand,
    isScoringApplication,
    scoreCurrentApplication,
  }
}