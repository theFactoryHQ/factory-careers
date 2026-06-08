<script setup lang="ts">
import { Calendar, ExternalLink } from 'lucide-vue-next'
import type { Interview } from '~/composables/useInterviews'
import type { ApplicationPanelSurface } from '~/composables/useApplicationPanelClass'
import {
  INTERVIEW_TYPE_LABELS,
  formatInterviewDate,
  formatInterviewStatusLabel,
} from '~/utils/interview-display'

const props = withDefaults(defineProps<{
  interviews: Interview[]
  surface?: ApplicationPanelSurface
}>(), {
  surface: 'sidebar',
})

const panelClass = useApplicationPanelClass(() => props.surface)
</script>

<template>
  <div v-if="interviews.length > 0" :class="[panelClass, 'p-5']">
    <div class="flex items-center gap-2.5 mb-4">
      <div class="ui-icon-state ui-icon-state-success size-7 rounded-lg">
        <Calendar class="size-3.5" />
      </div>
      <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Interviews</h3>
    </div>
    <div class="space-y-3">
      <div
        v-for="interview in interviews"
        :key="interview.id"
        class="rounded-lg border border-surface-200/60 dark:border-surface-800/40 p-3"
      >
        <div class="flex items-center justify-between mb-1">
          <NuxtLink
            :to="$localePath(`/dashboard/interviews/${interview.id}`)"
            class="text-sm font-medium text-surface-800 dark:text-surface-200 hover:text-brand-600 dark:hover:text-brand-400 transition-colors truncate"
          >
            {{ interview.title }}
          </NuxtLink>
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize shrink-0 ml-2"
            :class="{
              'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-400': interview.status === 'scheduled',
              'bg-success-50 text-success-700 dark:bg-success-950/40 dark:text-success-400': interview.status === 'completed',
              'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400': interview.status === 'cancelled' || interview.status === 'no_show',
            }"
          >
            {{ formatInterviewStatusLabel(interview.status) }}
          </span>
        </div>
        <div class="flex items-center gap-2 text-xs text-surface-400 dark:text-surface-500">
          <span class="font-medium">{{ formatInterviewDate(interview.scheduledAt) }}</span>
          <span class="text-surface-200 dark:text-surface-700">&middot;</span>
          <span>{{ INTERVIEW_TYPE_LABELS[interview.type] ?? interview.type }}</span>
          <span class="text-surface-200 dark:text-surface-700">&middot;</span>
          <span>{{ interview.duration }} min</span>
        </div>
        <div class="mt-2">
          <a
            v-if="interview.googleCalendarEventLink"
            :href="interview.googleCalendarEventLink"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
          >
            <Calendar class="size-2.5" />
            Open in Calendar
            <ExternalLink class="size-2" />
          </a>
        </div>
      </div>
    </div>
  </div>
</template>