<script setup lang="ts">
import { FileText } from 'lucide-vue-next'
import type { ApplicationPanelSurface } from '~/composables/useApplicationPanelClass'
import { formatResponseValue } from '~/utils/application-response-format'

const props = withDefaults(defineProps<{
  responses?: any[]
  surface?: ApplicationPanelSurface
  embedded?: boolean
}>(), {
  responses: () => [],
  surface: 'page',
  embedded: false,
})

const panelClass = useApplicationPanelClass(() => props.surface)
</script>

<template>
  <div
    v-if="responses.length > 0 || surface === 'sidebar'"
    :class="embedded ? '' : [panelClass, 'p-5']"
  >
    <template v-if="surface === 'sidebar'">
      <div
        v-if="responses.length === 0"
        class="ui-empty-panel p-8"
      >
        <div class="flex size-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800/60 mx-auto mb-3">
          <FileText class="size-6 text-surface-400 dark:text-surface-500" />
        </div>
        <p class="text-sm font-medium text-surface-600 dark:text-surface-300">No application responses.</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="response in responses"
          :key="response.id"
          class="ui-panel p-4"
        >
          <dt class="text-xs font-semibold text-surface-400 dark:text-surface-500 mb-1.5 uppercase tracking-wider">
            {{ response.question?.label ?? 'Unknown question' }}
          </dt>
          <dd class="text-sm text-surface-700 dark:text-surface-200 leading-relaxed">
            {{ formatResponseValue(response.value) }}
          </dd>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex items-center gap-2 mb-3">
        <FileText class="size-4 text-surface-500 dark:text-surface-400" />
        <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-200">
          Application Responses ({{ responses.length }})
        </h3>
      </div>
      <div class="space-y-3">
        <div
          v-for="response in responses"
          :key="response.id"
          class="border-b border-white/10 pb-3 last:border-0 last:pb-0"
        >
          <dt class="text-xs font-medium text-surface-500 dark:text-surface-400 mb-0.5">
            {{ response.question?.label ?? 'Unknown question' }}
          </dt>
          <dd class="text-sm text-surface-700 dark:text-surface-200">
            {{ formatResponseValue(response.value) }}
          </dd>
        </div>
      </div>
    </template>
  </div>
</template>