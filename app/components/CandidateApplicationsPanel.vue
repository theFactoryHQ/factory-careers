<script setup lang="ts">
import { Briefcase, Calendar, Plus } from 'lucide-vue-next'
import type { ApplicationStatus } from '~~/shared/application-status'
import { APPLICATION_STATUS_TRANSITIONS } from '~~/shared/status-transitions'
import {
  getApplicationTransitionActionLabel,
  getApplicationTransitionButtonClass,
} from '~/utils/status-display'

const props = withDefaults(defineProps<{
  applications?: any[]
  surface?: 'drawer' | 'page'
  showStatusTransitions?: boolean
  transitioningApplicationIds?: Set<string>
}>(), {
  applications: () => [],
  surface: 'page',
  showStatusTransitions: false,
  transitioningApplicationIds: () => new Set<string>(),
})

const emit = defineEmits<{
  apply: []
  schedule: [application: any]
  transition: [application: any, status: ApplicationStatus]
}>()

const localePath = useLocalePath()

const panelClass = useCandidatePanelClass(() => props.surface)

function getApplicationTransitions(status: string): ApplicationStatus[] {
  return (APPLICATION_STATUS_TRANSITIONS[status as ApplicationStatus] ?? []) as ApplicationStatus[]
}
</script>

<template>
  <div>
    <div class="mb-3 flex justify-end">
      <button
        class="factory-toolbar-button inline-flex h-10 min-h-10 cursor-pointer items-center gap-1.5 border px-3 py-0 text-xs font-medium transition-colors hover:border-brand-500 hover:bg-brand-500/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        @click="emit('apply')"
      >
        <Plus class="size-3.5" />
        Apply to Job
      </button>
    </div>

    <div
      v-if="!applications.length"
      :class="[panelClass, 'p-8 text-center']"
    >
      <Briefcase class="mx-auto mb-2 size-8 text-white/32" />
      <p class="text-sm text-white/54">No applications yet.</p>
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="app in applications"
        :key="app.id"
        :class="[panelClass, 'group flex flex-col gap-2 px-4 py-3 transition-all hover:border-brand-500/70 hover:bg-brand-500/10 sm:flex-row sm:items-center sm:justify-between']"
      >
        <div class="min-w-0 flex-1">
          <NuxtLink
            :to="localePath(`/dashboard/applications/${app.id}`)"
            class="block min-w-0"
          >
            <h4 class="truncate text-sm font-semibold text-white transition-colors group-hover:text-brand-400">
              {{ app.job.title }}
            </h4>
          </NuxtLink>
          <ApplicationTimestampStack
            :applied-at="app.createdAt"
            class="mt-1 items-start sm:items-start"
          />
        </div>
        <div class="flex shrink-0 items-center gap-1.5 sm:ml-3">
          <button
            v-for="nextStatus in showStatusTransitions ? getApplicationTransitions(app.status) : []"
            :key="nextStatus"
            class="group/action relative inline-flex size-8 shrink-0 cursor-pointer items-center justify-center border text-white transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            :class="getApplicationTransitionButtonClass(nextStatus, 'factory')"
            :title="getApplicationTransitionActionLabel(nextStatus)"
            :aria-label="getApplicationTransitionActionLabel(nextStatus)"
            :disabled="transitioningApplicationIds.has(app.id)"
            @click.stop="emit('transition', app, nextStatus)"
          >
            <ApplicationTransitionIcon :status="nextStatus" class="size-3.5" />
            <span class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap border border-white/12 bg-black px-2 py-1 text-[10px] font-semibold uppercase tracking-normal text-white opacity-0 shadow-xl shadow-black/40 transition-all duration-150 group-hover/action:translate-y-0 group-hover/action:opacity-100 group-focus-visible/action:translate-y-0 group-focus-visible/action:opacity-100">
              {{ getApplicationTransitionActionLabel(nextStatus) }}
            </span>
          </button>
          <button
            class="group/action relative inline-flex shrink-0 cursor-pointer items-center justify-center border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            :class="showStatusTransitions ? 'size-8 border-white/16 bg-black text-white/80 hover:border-brand-500 hover:bg-brand-500/12 hover:text-white' : 'factory-toolbar-button h-8 min-h-8 gap-1 px-2.5 py-0 text-[10px] font-medium'"
            title="Schedule Interview"
            aria-label="Schedule Interview"
            @click="emit('schedule', app)"
          >
            <Calendar :class="showStatusTransitions ? 'size-3.5' : 'size-3'" />
            <span v-if="!showStatusTransitions">Schedule</span>
            <span
              v-else
              class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap border border-white/12 bg-black px-2 py-1 text-[10px] font-semibold uppercase tracking-normal text-white opacity-0 shadow-xl shadow-black/40 transition-all duration-150 group-hover/action:translate-y-0 group-hover/action:opacity-100 group-focus-visible/action:translate-y-0 group-focus-visible/action:opacity-100"
            >
              Schedule Interview
            </span>
          </button>
          <ApplicationStatusBadge :status="app.status" />
        </div>
      </div>
    </div>
  </div>
</template>
