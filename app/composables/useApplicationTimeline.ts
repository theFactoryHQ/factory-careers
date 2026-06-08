import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

export interface ApplicationTimelineEntry {
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

export const APPLICATION_TIMELINE_ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  status_changed: 'Status changed',
  comment_added: 'Comment added',
  scored: 'Scored',
  scheduled: 'Scheduled',
}

export function formatApplicationTimelineDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getApplicationTimelineActionColor(action: string): string {
  switch (action) {
    case 'created':
      return 'bg-green-500'
    case 'status_changed':
      return 'bg-blue-500'
    case 'updated':
      return 'bg-amber-500'
    case 'deleted':
      return 'bg-danger-500'
    case 'comment_added':
      return 'bg-violet-500'
    case 'scored':
      return 'bg-teal-500'
    case 'scheduled':
      return 'bg-brand-500'
    default:
      return 'bg-surface-400'
  }
}

export function describeApplicationTimelineItem(item: ApplicationTimelineEntry): string {
  const actor = item.actorName ?? item.actorEmail ?? 'System'
  const action = APPLICATION_TIMELINE_ACTION_LABELS[item.action] ?? item.action
  const resource = item.resourceType

  if (item.action === 'status_changed' && item.metadata) {
    const from = item.metadata.from_status ?? item.metadata.fromStatus
    const to = item.metadata.to_status ?? item.metadata.toStatus
    if (from && to) return `${actor} changed ${resource} status from ${from} to ${to}`
  }

  if (item.action === 'scored' && item.metadata) {
    const score = item.metadata.score
    if (score != null) return `${actor} scored ${resource} — ${score} pts`
  }

  return `${actor} ${action.toLowerCase()} ${resource}`
}

type UseApplicationTimelineOptions = {
  candidateId: MaybeRefOrGetter<string | null | undefined>
}

export function useApplicationTimeline(options: UseApplicationTimelineOptions) {
  const timelineItems = ref<ApplicationTimelineEntry[]>([])
  const timelineLoading = ref(false)
  const timelineError = ref<string | null>(null)
  const timelineLoaded = ref(false)

  async function loadTimeline() {
    const candidateId = toValue(options.candidateId)
    if (!candidateId) return

    timelineLoading.value = true
    timelineError.value = null

    try {
      const result = await $fetch<{ items: ApplicationTimelineEntry[] }>('/api/activity-log/candidate-timeline', {
        query: { candidateId },
      })
      timelineItems.value = result.items
      timelineLoaded.value = true
    } catch (err: any) {
      timelineError.value = err?.data?.statusMessage ?? 'Failed to load timeline'
    } finally {
      timelineLoading.value = false
    }
  }

  function resetTimeline() {
    timelineItems.value = []
    timelineLoaded.value = false
    timelineError.value = null
  }

  return {
    timelineItems,
    timelineLoading,
    timelineError,
    timelineLoaded,
    loadTimeline,
    resetTimeline,
  }
}