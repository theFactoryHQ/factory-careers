<script setup lang="ts">
import { Calendar } from 'lucide-vue-next'
import {
  getApplicationTransitionButtonClass,
  getApplicationTransitionLabel,
  getScoreBadgeClass,
} from '~/utils/status-display'

const props = defineProps<{
  id: string
  candidateFirstName: string
  candidateLastName: string
  candidateEmail: string
  createdAt: string
  score: number | null
  allowedTransitions: string[]
  isTransitioning: boolean
}>()

const emit = defineEmits<{
  (e: 'transition', status: string): void
}>()

const { formatPersonName, formatDateTime } = useOrgSettings()
</script>

<template>
  <div class="rounded-xl border border-surface-200/80 dark:border-surface-800/60 bg-white dark:bg-surface-900 p-3 shadow-sm shadow-surface-900/[0.03] dark:shadow-none">
    <NuxtLink
      :to="$localePath(`/dashboard/applications/${id}`)"
      class="block mb-2 group"
    >
      <h4 class="text-sm font-semibold text-surface-900 dark:text-surface-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors truncate">
        {{ formatPersonName(candidateFirstName, candidateLastName) }}
      </h4>
      <div class="flex items-center gap-2 text-xs text-surface-400 mt-0.5">
        <CopyEmailButton :email="candidateEmail" class="truncate text-surface-400" />
      </div>
    </NuxtLink>

    <div class="flex items-center justify-between text-xs text-surface-400">
      <span class="inline-flex items-center gap-1">
        <Calendar class="size-3" />
        {{ formatDateTime(createdAt) }}
      </span>
      <span v-if="score != null" class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset"
        :class="getScoreBadgeClass(score)"
      >
        {{ score }}pts
      </span>
    </div>

    <!-- Transition buttons -->
    <div v-if="allowedTransitions.length > 0" class="flex flex-wrap gap-1 mt-2 pt-2 border-t border-surface-100 dark:border-surface-800/60">
      <button
        v-for="nextStatus in allowedTransitions"
        :key="nextStatus"
        :disabled="isTransitioning"
        class="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50"
        :class="getApplicationTransitionButtonClass(nextStatus, 'subtle')"
        @click.prevent="emit('transition', nextStatus)"
      >
        {{ getApplicationTransitionLabel(nextStatus) }}
      </button>
    </div>
  </div>
</template>
