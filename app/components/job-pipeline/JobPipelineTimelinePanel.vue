<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Plus, Pencil, Trash2, ArrowRight, MessageSquare, Brain, Calendar, Clock, History,
  AlertTriangle,
} from 'lucide-vue-next'
import { getApplicationStatusBadgeClass } from '~/utils/status-display'

export interface TimelineEntry {
  id: string
  action: string
  resourceType: string
  resourceId: string
  metadata: Record<string, unknown> | null
  createdAt: string
  actorName: string | null
  actorEmail: string | null
  resourceName: string | null
  jobTitle: string | null
  candidateName: string | null
}

const props = defineProps<{
  candidateId?: string
}>()

const timelineItems = ref<TimelineEntry[]>([])
const timelineLoading = ref(false)
const timelineError = ref<string | null>(null)
const timelineLoadedFor = ref<string | null>(null)

const timelineActionLabels: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  status_changed: 'Status changed',
  comment_added: 'Comment added',
  scored: 'Scored',
  scheduled: 'Scheduled',
}

function formatTimelineDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface TimelineActionStyle {
  icon: typeof Plus
  color: string
  bg: string
}

function getTimelineActionStyle(action: string): TimelineActionStyle {
  const map: Record<string, TimelineActionStyle> = {
    created: { icon: Plus, color: 'text-success-600 dark:text-success-400', bg: 'bg-success-50 dark:bg-success-950/50' },
    updated: { icon: Pencil, color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-950/50' },
    deleted: { icon: Trash2, color: 'text-danger-600 dark:text-danger-400', bg: 'bg-danger-50 dark:bg-danger-950/50' },
    status_changed: { icon: ArrowRight, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/50' },
    comment_added: { icon: MessageSquare, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/50' },
    scored: { icon: Brain, color: 'text-accent-600 dark:text-accent-400', bg: 'bg-accent-50 dark:bg-accent-950/50' },
    scheduled: { icon: Calendar, color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-950/50' },
  }
  return map[action] ?? { icon: Clock, color: 'text-surface-500 dark:text-surface-400', bg: 'bg-surface-100 dark:bg-surface-800' }
}

async function loadTimeline(candidateId: string) {
  timelineLoading.value = true
  timelineError.value = null
  try {
    const result = await $fetch<{ items: TimelineEntry[] }>('/api/activity-log/candidate-timeline', {
      query: { candidateId },
    })
    timelineItems.value = result.items
    timelineLoadedFor.value = candidateId
  } catch (err: any) {
    timelineError.value = err?.data?.statusMessage ?? 'Failed to load timeline'
    timelineLoadedFor.value = null
  } finally {
    timelineLoading.value = false
  }
}

function retryTimeline() {
  if (props.candidateId) {
    void loadTimeline(props.candidateId)
  }
}

watch(
  () => props.candidateId,
  (candidateId) => {
    timelineItems.value = []
    timelineLoadedFor.value = null
    timelineError.value = null

    if (!candidateId) return
    if (timelineLoadedFor.value === candidateId) return
    void loadTimeline(candidateId)
  },
  { immediate: true },
)
</script>

<template>
  <div class="space-y-3">
    <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2 mb-3">
      <History class="size-4 text-surface-400 dark:text-surface-500" />
      Timeline
    </h2>

    <div v-if="timelineLoading" class="text-center py-12 text-surface-400">
      <div class="size-6 rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-800 dark:border-t-brand-400 animate-spin mx-auto mb-3" />
      Loading timeline…
    </div>

    <div
      v-else-if="timelineError"
      class="rounded-xl border border-danger-200/80 dark:border-danger-800/60 bg-danger-50 dark:bg-danger-950/40 p-5 text-center"
    >
      <AlertTriangle class="size-6 text-danger-400 mx-auto mb-2" />
      <p class="text-sm text-danger-700 dark:text-danger-400">{{ timelineError }}</p>
      <button
        class="mt-3 text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium cursor-pointer"
        @click="retryTimeline"
      >
        Retry
      </button>
    </div>

    <div
      v-else-if="timelineItems.length === 0"
      class="ui-panel ui-dashboard-panel p-10 text-center"
    >
      <div class="flex size-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800/60 mx-auto mb-3">
        <History class="size-6 text-surface-400 dark:text-surface-500" />
      </div>
      <p class="text-sm font-medium text-surface-600 dark:text-surface-300">No activity recorded yet.</p>
      <p class="mt-1 text-xs text-surface-400 dark:text-surface-500">Activity for this candidate will appear here.</p>
    </div>

    <div v-else>
      <div
        v-for="(item, index) in timelineItems"
        :key="item.id"
        class="group flex items-start gap-3 py-1.5 px-1 transition-colors duration-150 hover:bg-surface-50 dark:hover:bg-surface-800/40 rounded-lg"
      >
        <div class="flex flex-col items-center shrink-0">
          <div class="flex items-center justify-center size-6 rounded shrink-0" :class="getTimelineActionStyle(item.action).bg">
            <component :is="getTimelineActionStyle(item.action).icon" class="size-3" :class="getTimelineActionStyle(item.action).color" />
          </div>
          <div
            v-if="index < timelineItems.length - 1"
            class="w-px flex-1 min-h-[10px] bg-surface-200 dark:bg-surface-800 mt-0.5"
          />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-[13px] font-medium text-surface-900 dark:text-surface-100 shrink-0">{{ timelineActionLabels[item.action] ?? item.action }}</span>
            <span class="text-[13px] text-surface-500 dark:text-surface-400">{{ item.resourceType }}</span>
            <template v-if="item.action === 'status_changed' && item.metadata">
              <span v-if="item.metadata.from_status || item.metadata.fromStatus" class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none" :class="getApplicationStatusBadgeClass(String(item.metadata.from_status ?? item.metadata.fromStatus), 'soft')">{{ item.metadata.from_status ?? item.metadata.fromStatus }}</span>
              <ArrowRight class="size-2.5 text-surface-400 dark:text-surface-500 shrink-0" />
              <span v-if="item.metadata.to_status || item.metadata.toStatus" class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none" :class="getApplicationStatusBadgeClass(String(item.metadata.to_status ?? item.metadata.toStatus), 'soft')">{{ item.metadata.to_status ?? item.metadata.toStatus }}</span>
            </template>
            <template v-else-if="item.action === 'scored' && item.metadata?.score">
              <span class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none bg-accent-100 text-accent-700 dark:bg-accent-900/60 dark:text-accent-300">{{ item.metadata.score }} pts</span>
            </template>
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <span v-if="item.actorName || item.actorEmail" class="text-[11px] text-surface-400 dark:text-surface-500">{{ item.actorName ?? item.actorEmail }}</span>
            <span class="text-[11px] text-surface-400 dark:text-surface-500 tabular-nums">{{ formatTimelineDate(item.createdAt) }}</span>
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