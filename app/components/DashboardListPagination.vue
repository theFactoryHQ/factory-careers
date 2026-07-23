<script setup lang="ts">
import { getListPageSummary } from '~~/shared/list-pagination'

const props = defineProps<{
  page: number
  pageSize: number
  total: number
  noun: string
}>()

const emit = defineEmits<{
  'update:page': [page: number]
}>()

const summary = computed(() =>
  getListPageSummary(props.total, props.page, props.pageSize),
)
const displayedPage = computed(() =>
  Math.min(props.page, summary.value.totalPages),
)
</script>

<template>
  <nav
    class="flex flex-col gap-3 border-t border-white/10 pt-3 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between"
    :aria-label="`${noun} pagination`"
  >
    <p aria-live="polite">
      Showing {{ summary.from }}–{{ summary.to }} of {{ total }} {{ noun }}
    </p>

    <div class="flex items-center gap-3">
      <button
        type="button"
        class="rounded-lg border border-white/10 px-3 py-1.5 font-medium text-white transition-colors hover:border-white/20 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-brand-500/60 disabled:cursor-not-allowed disabled:opacity-40"
        :aria-label="`Previous ${noun} page`"
        :disabled="displayedPage <= 1"
        @click="emit('update:page', displayedPage - 1)"
      >
        Previous
      </button>
      <span class="tabular-nums" aria-live="polite">
        Page {{ displayedPage }} of {{ summary.totalPages }}
      </span>
      <button
        type="button"
        class="rounded-lg border border-white/10 px-3 py-1.5 font-medium text-white transition-colors hover:border-white/20 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-brand-500/60 disabled:cursor-not-allowed disabled:opacity-40"
        :aria-label="`Next ${noun} page`"
        :disabled="displayedPage >= summary.totalPages"
        @click="emit('update:page', displayedPage + 1)"
      >
        Next
      </button>
    </div>
  </nav>
</template>
