<script setup lang="ts">
import { ChevronDown, Info } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  id: string
  title: string
  description?: string
  defaultOpen?: boolean
  contentClass?: string
}>(), {
  defaultOpen: false,
  contentClass: 'px-5 pb-5',
})

const headingId = computed(() => `${props.id}-heading`)
const contentId = computed(() => `${props.id}-content`)
</script>

<template>
  <details
    :id="id"
    class="ui-panel group relative overflow-hidden"
    :open="defaultOpen"
  >
    <summary
      class="flex cursor-pointer list-none items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500/25 dark:hover:bg-surface-900 [&::-webkit-details-marker]:hidden"
      :class="$slots.actions ? 'pr-40' : 'pr-5'"
    >
      <ChevronDown
        class="mt-0.5 size-4 shrink-0 -rotate-90 text-surface-400 transition-transform group-open:rotate-0"
      />
      <span class="min-w-0">
        <span class="flex min-w-0 items-center gap-2">
          <slot name="icon" />
          <span
            :id="headingId"
            class="truncate text-sm font-semibold text-surface-700 dark:text-surface-300"
          >
            {{ title }}
          </span>
          <button
            v-if="description"
            class="group/info relative inline-flex size-5 shrink-0 items-center justify-center rounded-full text-surface-400 outline-none transition-colors hover:bg-surface-100 hover:text-surface-700 focus-visible:bg-surface-100 focus-visible:text-surface-700 focus-visible:ring-2 focus-visible:ring-brand-500/25 dark:hover:bg-surface-800 dark:hover:text-surface-200 dark:focus-visible:bg-surface-800 dark:focus-visible:text-surface-200"
            type="button"
            :title="description"
            :aria-label="description"
            @click.stop
          >
            <Info class="size-3.5" />
            <span
              class="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-64 -translate-x-1/2 border border-surface-200 bg-white px-3 py-2 text-left text-xs font-normal leading-relaxed text-surface-600 shadow-lg group-hover/info:block group-focus/info:block dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300"
              aria-hidden="true"
            >
              {{ description }}
            </span>
          </button>
        </span>
      </span>
    </summary>

    <div
      v-if="$slots.actions"
      class="absolute right-5 top-4 flex items-center gap-2"
    >
      <slot name="actions" />
    </div>

    <div
      :id="contentId"
      :class="contentClass"
      role="region"
      :aria-labelledby="headingId"
    >
      <slot />
    </div>
  </details>
</template>
