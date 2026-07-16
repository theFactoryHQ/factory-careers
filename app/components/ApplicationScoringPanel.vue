<script setup lang="ts">
import { Brain, Loader2 } from 'lucide-vue-next'
import type { ApplicationPanelSurface } from '~/composables/useApplicationPanelClass'
import type { ScoringBand } from '~~/shared/scoring-bands'

const props = withDefaults(defineProps<{
  surface?: ApplicationPanelSurface
  applicationId: string
  score?: number | null
  analysisRunId?: string | null
  scoreBand?: ScoringBand | null
  scoringSummary: string
  scoringSummaryFallback: string
  isScoring: boolean
  showScoreBand?: boolean
  fullWidth?: boolean
}>(), {
  surface: 'page',
  score: null,
  analysisRunId: null,
  scoreBand: null,
  showScoreBand: false,
  fullWidth: false,
})

const emit = defineEmits<{
  score: []
}>()

const panelClass = useApplicationPanelClass(() => props.surface)
</script>

<template>
  <div
    :class="[
      panelClass,
      'p-5',
      fullWidth ? 'md:col-span-2' : '',
    ]"
  >
    <div
      class="flex items-center justify-between"
      :class="surface === 'page' ? 'mb-5 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between' : 'mb-5'"
    >
      <div class="flex items-center gap-2">
        <Brain class="size-4 text-surface-500 dark:text-surface-400" />
        <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Scoring</h3>
      </div>
      <div class="flex items-center gap-2">
        <ScoringFeedbackControl
          :key="`${applicationId}:${analysisRunId ?? 'none'}`"
          :application-id="applicationId"
          :analysis-run-id="analysisRunId"
        />
        <button
          type="button"
          :disabled="isScoring"
          class="factory-button-cta factory-button-premium inline-flex h-8 min-h-8 cursor-pointer items-center justify-center gap-1.5 px-2.5 py-0 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          @click="emit('score')"
        >
          <Loader2 v-if="isScoring" class="size-3 animate-spin" />
          <Brain v-else class="size-3" />
          {{ isScoring ? 'Scoring...' : (score != null ? 'Re-score' : 'Run Analysis') }}
        </button>
      </div>
    </div>

    <dl
      class="grid gap-5 text-sm"
      :class="surface === 'page'
        ? 'md:grid-cols-[10rem_minmax(0,1fr)]'
        : 'md:grid-cols-[8rem_minmax(0,1fr)]'"
    >
      <div>
        <dt
          class="text-xs font-semibold uppercase tracking-[0.18em]"
          :class="surface === 'page' ? 'text-surface-500 dark:text-surface-500' : 'text-surface-400'"
        >
          Score
        </dt>
        <dd
          class="flex flex-wrap items-center gap-2"
          :class="surface === 'page' ? 'mt-2' : 'mt-1'"
        >
          <span
            class="font-semibold text-surface-900 dark:text-white"
            :class="surface === 'page' ? 'text-2xl' : 'text-2xl'"
          >
            {{ score != null ? score : '—' }}
            <span
              v-if="score != null"
              class="ml-1 text-sm font-medium"
              :class="surface === 'page' ? 'text-surface-500 dark:text-surface-500' : 'text-surface-400'"
            >
              pts
            </span>
          </span>
          <ScoringBandBadge v-if="showScoreBand" :band="scoreBand" />
        </dd>
      </div>
      <div>
        <dt
          class="text-xs font-semibold uppercase tracking-[0.18em]"
          :class="surface === 'page' ? 'text-surface-500 dark:text-surface-500' : 'text-surface-400'"
        >
          AI summary
        </dt>
        <dd
          v-if="scoringSummary"
          class="max-w-3xl text-sm leading-6 text-surface-700 dark:text-surface-300"
          :class="surface === 'page' ? 'mt-2' : 'mt-1'"
        >
          {{ scoringSummary }}
        </dd>
        <dd
          v-else
          class="max-w-3xl text-sm leading-6"
          :class="[
            surface === 'page' ? 'mt-2 text-surface-500 dark:text-surface-500' : 'mt-1 text-surface-500 dark:text-surface-400',
          ]"
        >
          {{ scoringSummaryFallback }}
        </dd>
      </div>
    </dl>
  </div>
</template>
