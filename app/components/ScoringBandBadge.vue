<script setup lang="ts">
import type { ScoringBand } from '~~/shared/scoring-bands'

defineProps<{
  band: ScoringBand | null | undefined
}>()

const colorClasses: Record<ScoringBand['color'], string> = {
  danger: 'border-danger-500/30 bg-danger-500/10 text-danger-700 dark:text-danger-300',
  warning: 'border-warning-500/30 bg-warning-500/10 text-warning-700 dark:text-warning-300',
  success: 'border-success-500/30 bg-success-500/10 text-success-700 dark:text-success-300',
  neutral: 'border-surface-300 bg-surface-100 text-surface-700 dark:border-white/14 dark:bg-white/[0.06] dark:text-white/70',
}
</script>

<template>
  <span
    v-if="band"
    class="inline-flex shrink-0 items-center border px-2 py-0.5 text-[11px] font-semibold leading-none"
    :class="colorClasses[band.color] ?? colorClasses.neutral"
    :title="band.description || `${band.minScore}-${band.maxScore}`"
  >
    {{ band.label }}
  </span>
</template>
