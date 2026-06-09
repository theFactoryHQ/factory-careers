<script setup lang="ts">
import { MessageSquare } from 'lucide-vue-next'

export type PipelineResponse = {
  id: string
  value: unknown
  question: {
    id: string
    label: string
    type: string
    options: string[] | null
  } | null
}

const props = defineProps<{
  responses: PipelineResponse[]
}>()

function formatResponseValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value ?? '—')
}
</script>

<template>
  <div class="space-y-3">
    <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2 mb-3">
      <MessageSquare class="size-4 text-surface-400 dark:text-surface-500" />
      Responses
    </h2>
    <template v-if="props.responses.length">
      <div class="space-y-3">
        <div
          v-for="response in props.responses"
          :key="response.id"
          class="ui-panel ui-dashboard-panel p-5"
        >
          <p class="text-xs font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">
            {{ response.question?.label ?? 'Unknown question' }}
          </p>
          <p class="text-sm text-surface-700 dark:text-surface-200 leading-relaxed">
            {{ formatResponseValue(response.value) }}
          </p>
        </div>
      </div>
    </template>
    <div v-else class="ui-panel ui-dashboard-panel p-10 text-center">
      <div class="flex size-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800/60 mx-auto mb-3">
        <MessageSquare class="size-6 text-surface-400 dark:text-surface-500" />
      </div>
      <p class="text-sm font-medium text-surface-600 dark:text-surface-300">No responses</p>
      <p class="mt-1 text-xs text-surface-400 dark:text-surface-500">Application form responses will appear here.</p>
    </div>
  </div>
</template>