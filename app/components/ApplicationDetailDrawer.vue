<script setup lang="ts">
import { User, Briefcase, Calendar } from 'lucide-vue-next'
import {
  getApplicationTransitionActionLabel,
  getApplicationTransitionButtonClass,
} from '~/utils/status-display'
import { formatPhoneNumber } from '~/utils/phone-format'

const props = defineProps<{
  applicationId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const localePath = useLocalePath()

const { application, status: fetchStatus, error, refresh, updateApplication } = useApplication(() => props.applicationId)
const { formatCandidateName } = useOrgSettings()

const {
  scoringData,
  scoringSummary,
  scoringSummaryFallback,
  scoreBand,
  isScoringApplication,
  scoreCurrentApplication,
  showInterviewSidebar,
  openInterviewScheduler,
  allowedTransitions,
  isTransitioning,
  transitionToStatus,
  isEditingNotes,
  notesInput,
  isSavingNotes,
  notesSaveStatus,
  startEditNotes,
  saveNotes,
  autosaveNotes,
  finishEditNotes,
} = useApplicationDetailSurface({
  applicationId: () => props.applicationId,
  application,
  source: 'application_detail_drawer',
  refreshApplication: false,
  updateApplication,
})
</script>

<template>
  <AppDetailDrawerShell
    title="Application detail"
    drawer-aria-label="Application detail"
    :full-page-href="localePath(`/dashboard/applications/${applicationId}`)"
    close-aria-label="Close application detail"
    @close="emit('close')"
  >
    <!-- Loading -->
    <div v-if="fetchStatus === 'pending'" class="text-center py-12 text-surface-400">
      Loading application…
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="border border-danger-500/45 bg-danger-500/10 p-4 text-sm text-danger-200"
    >
      {{ error.statusCode === 404 ? 'Application not found.' : 'Failed to load application.' }}
    </div>

    <template v-else-if="application">
      <!-- Header card -->
      <div class="relative border border-white/12 bg-white/[0.025] p-5">
        <div class="flex flex-col gap-4 sm:pr-56">
          <div class="min-w-0">
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-surface-500 dark:text-surface-400">
              Application Overview
            </p>
            <div class="mb-3 flex flex-wrap items-center gap-2 text-surface-400">
              <h2 class="truncate text-2xl font-bold text-surface-900 dark:text-surface-50">
                {{ formatCandidateName(application.candidate) }}
              </h2>
              <span class="text-surface-400">→</span>
              <NuxtLink
                :to="localePath(`/dashboard/jobs/${application.job.id}`)"
                class="truncate text-xl text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                {{ application.job.title }}
              </NuxtLink>
            </div>
            <ApplicationStatusBadge :status="application.status" />
          </div>

          <ApplicationTimestampStack
            :applied-at="application.createdAt"
            :updated-at="application.updatedAt"
            floating
          />
        </div>
      </div>

      <!-- Quick actions -->
      <div class="border border-white/12 bg-white/[0.025] p-3">
        <div class="flex flex-nowrap items-center gap-1.5 overflow-x-auto">
          <span class="inline-flex shrink-0 items-center whitespace-nowrap bg-white/[0.04] px-2 py-1.5 text-[10px] font-semibold uppercase leading-none tracking-normal text-white/58">Quick actions</span>
          <button
            v-for="nextStatus in allowedTransitions"
            :key="nextStatus"
            :disabled="isTransitioning"
            class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[10px] font-semibold uppercase leading-none tracking-normal transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            :class="getApplicationTransitionButtonClass(nextStatus, 'factory')"
            @click="transitionToStatus(nextStatus)"
          >
            <ApplicationTransitionIcon :status="nextStatus" />
            {{ getApplicationTransitionActionLabel(nextStatus) }}
          </button>
          <button
            class="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap border border-white/16 bg-black px-2.5 py-1.5 text-[10px] font-semibold uppercase leading-none tracking-normal text-white/80 hover:border-brand-500 hover:bg-brand-500/12 hover:text-white transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            @click="openInterviewScheduler"
          >
            <Calendar class="size-3" />
            Schedule Interview
          </button>
        </div>
      </div>

      <!-- Candidate & Job cards -->
      <div class="grid gap-4 sm:grid-cols-2">
        <!-- Candidate info -->
        <div class="border border-white/12 bg-white/[0.025] p-5">
          <div class="flex items-center gap-2 mb-3">
            <User class="size-4 text-surface-500 dark:text-surface-400" />
            <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Candidate</h3>
          </div>
          <dl class="grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt class="text-surface-400">Name</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">
                <NuxtLink
                  :to="localePath(`/dashboard/candidates/${application.candidate.id}`)"
                  class="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
                >
                  {{ formatCandidateName(application.candidate) }}
                </NuxtLink>
              </dd>
            </div>
            <div>
              <dt class="text-surface-400">Email</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">
                <CopyEmailButton :email="application.candidate.email" :show-icon="false" class="text-surface-700 dark:text-surface-200" />
              </dd>
            </div>
            <div v-if="application.candidate.phone">
              <dt class="text-surface-400">Phone</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">{{ formatPhoneNumber(application.candidate.phone) }}</dd>
            </div>
          </dl>
        </div>

        <!-- Job info -->
        <div class="border border-white/12 bg-white/[0.025] p-5">
          <div class="flex items-center gap-2 mb-3">
            <Briefcase class="size-4 text-surface-500 dark:text-surface-400" />
            <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Job</h3>
          </div>
          <dl class="grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt class="text-surface-400">Title</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">
                <NuxtLink
                  :to="localePath(`/dashboard/jobs/${application.job.id}`)"
                  class="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
                >
                  {{ application.job.title }}
                </NuxtLink>
              </dd>
            </div>
            <div>
              <dt class="text-surface-400">Job Status</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium capitalize">{{ application.job.status }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <ApplicationScoringPanel
        surface="drawer"
        :application-id="applicationId"
        :score="application.score"
        :analysis-run-id="scoringData?.latestRun?.id ?? null"
        :score-band="scoreBand"
        :scoring-summary="scoringSummary"
        :scoring-summary-fallback="scoringSummaryFallback"
        :is-scoring="isScoringApplication"
        show-score-band
        @score="scoreCurrentApplication"
      />

      <ApplicationNotesPanel
        surface="drawer"
        :notes="application.notes"
        :is-editing-notes="isEditingNotes"
        :notes-input="notesInput"
        :is-saving-notes="isSavingNotes"
        :notes-save-status="notesSaveStatus"
        focus-on-edit
        @update:notes-input="notesInput = $event"
        @start-edit="startEditNotes"
        @autosave="autosaveNotes"
        @save="saveNotes"
        @finish-edit="finishEditNotes"
      />

      <!-- Properties -->
      <div class="border border-white/12 bg-white/[0.025] p-4">
        <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-2 px-2">Properties</h3>
        <PropertyBlock
          entity-type="application"
          :entity-id="applicationId"
          :job-id="application.job.id"
          :entries="(application.properties ?? []) as import('~~/shared/properties').PropertyEntry[]"
          @refresh="refresh()"
        />
      </div>

      <ApplicationResponsesPanel
        v-if="application.responses && application.responses.length > 0"
        surface="drawer"
        :responses="application.responses"
      />
    </template>

    <template #overlays>
      <InterviewScheduleSidebar
        v-if="showInterviewSidebar && application"
        :application-id="applicationId"
        :candidate-name="formatCandidateName(application.candidate)"
        :job-title="application.job.title"
        @close="showInterviewSidebar = false"
        @scheduled="showInterviewSidebar = false"
      />
    </template>
  </AppDetailDrawerShell>
</template>
