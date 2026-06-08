import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'
import type { ScoringBand } from '~~/shared/scoring-bands'

export type ApplicationScoresResponse = {
  scoreBand?: ScoringBand | null
  compositeScore?: number | null
  latestRun?: {
    id: string
    summary: string | null
  } | null
}

type UseApplicationScoringDataOptions = {
  applicationId: MaybeRefOrGetter<string>
  applicationScore?: MaybeRefOrGetter<number | null | undefined>
}

export function useApplicationScoringData(options: UseApplicationScoringDataOptions) {
  const applicationId = computed(() => toValue(options.applicationId))

  const { data: scoringData, refresh: refreshScoring } = useFetch<ApplicationScoresResponse>(
    () => `/api/applications/${applicationId.value}/scores`,
    {
      key: computed(() => `application-scores-${applicationId.value}`),
      headers: useRequestHeaders(['cookie']),
      watch: [applicationId],
    },
  )

  const scoringSummary = computed(() => {
    const summary = scoringData.value?.latestRun?.summary
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