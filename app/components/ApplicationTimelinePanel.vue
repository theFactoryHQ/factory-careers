<script setup lang="ts">
import { AlertTriangle, History } from 'lucide-vue-next'
import type { ApplicationTimelineEntry } from '~/composables/useApplicationTimeline'
import {
  describeApplicationTimelineItem,
  formatApplicationTimelineDate,
  getApplicationTimelineActionColor,
} from '~/composables/useApplicationTimeline'

const props = defineProps<{
  items: ApplicationTimelineEntry[]
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="space-y-1">
    <div v-if="loading" class="text-center py-12 text-surface-400">
      <div class="size-6 rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-800 dark:border-t-brand-400 animate-spin mx-auto mb-3" />
      Loading timeline…
    </div>

    <div
      v-else-if="error"
      class="ui-alert ui-alert-danger p-5 text-center"
    >
      <AlertTriangle class="size-6 text-danger-400 mx-auto mb-2" />
      <p class="text-sm text-danger-700 dark:text-danger-400">{{ error }}</p>
      <button
        class="ui-inline-link-brand mt-3 text-sm font-medium"
        @click="emit('retry')"
      >
        Retry
      </button>
    </div>

    <div
      v-else-if="items.length === 0"
      class="ui-empty-panel p-8"
    >
      <div class="flex size-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800/60 mx-auto mb-3">
        <History class="size-6 text-surface-400 dark:text-surface-500" />
      </div>
      <p class="text-sm font-medium text-surface-600 dark:text-surface-300">No activity recorded yet.</p>
      <p class="text-xs text-surface-400 dark:text-surface-500 mt-1">Activity for this candidate will appear here.</p>
    </div>

    <div v-else>
      <div
        v-for="(item, index) in items"
        :key="item.id"
        class="flex gap-3 py-2 group"
      >
        <div class="flex flex-col items-center shrink-0 mt-[3px]">
          <div
            class="size-[9px] rounded-full ring-2 ring-white dark:ring-surface-950 shrink-0"
            :class="getApplicationTimelineActionColor(item.action)"
          />
          <div
            v-if="index < items.length - 1"
            class="w-px flex-1 min-h-[14px] bg-surface-200 dark:bg-surface-700 mt-1"
          />
        </div>

        <div class="min-w-0 flex-1">
          <p class="text-sm text-surface-700 dark:text-surface-200 leading-snug">
            {{ describeApplicationTimelineItem(item) }}
          </p>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-[11px] text-surface-400 dark:text-surface-500 tabular-nums">
              {{ formatApplicationTimelineDate(item.createdAt) }}
            </span>
            <span
              v-if="item.jobTitle"
              class="text-[10px] text-surface-400 dark:text-surface-500 bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 truncate max-w-[140px]"
            >
              {{ item.jobTitle }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>