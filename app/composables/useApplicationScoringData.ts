import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'
import type { ScoringBand } from '~~/shared/scoring-bands'

export type ApplicationScoresResponse = {
  applicationId: string
  scoreBand?: ScoringBand | null
  compositeScore?: number | null
  latestSuccessfulRun?: {
    id: string
    summary: string | null
  } | null
  latestAttempt?: {
    id: string
    status: 'completed' | 'failed' | 'partial'
  } | null
}

type UseApplicationScoringDataOptions = {
  applicationId: MaybeRefOrGetter<string>
  applicationScore?: MaybeRefOrGetter<number | null | undefined>
}

export function useApplicationScoringData(options: UseApplicationScoringDataOptions) {
  const applicationId = computed(() => toValue(options.applicationId))

  const { data: fetchedScoringData, refresh: refreshScoring } = useFetch<ApplicationScoresResponse>(
    () => `/api/applications/${applicationId.value}/scores`,
    {
      key: computed(() => `application-scores-${applicationId.value}`),
      headers: useRequestHeaders(['cookie']),
      watch: [applicationId],
    },
  )

  const scoringData = computed(() => (
    fetchedScoringData.value?.applicationId === applicationId.value
      ? fetchedScoringData.value
      : null
  ))

  const scoringSummary = computed(() => {
    const summary = scoringData.value?.latestSuccessfulRun?.summary
    return typeof summary === 'string' ? summary.trim() : ''
  })

  const scoringSummaryFallback = computed(() => {
    const score = toValue(options.applicationScore)
    if (score != null) {
      return 'No AI summary was stored for this score. Re-score to generate one.'
    }

    return 'Run analysis to generate an AI scoring summary.'
  })

  const scoreBand = computed(() => scoringData.value?.scoreBand ?? null)

  return {
    scoringData,
    refreshScoring,
    scoringSummary,
    scoringSummaryFallback,
    scoreBand,
  }
}
