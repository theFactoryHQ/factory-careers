<script setup lang="ts">
import { User, Briefcase, Calendar } from 'lucide-vue-next'
import {
  getApplicationTransitionActionLabel,
  getApplicationTransitionButtonClass,
} from '~/utils/status-display'
import { formatPhoneNumber } from '~/utils/phone-format'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const applicationId = route.params.id as string

const { application, status: fetchStatus, error, refresh, updateApplication } = useApplication(applicationId)
const { formatCandidateName } = useOrgSettings()

const {
  scoringData,
  scoringSummary,
  scoringSummaryFallback,
  isScoringApplication,
  scoreCurrentApplication,
} = useApplicationScoringPanel({
  applicationId,
  application,
  source: 'application_detail_page',
  refresh,
})

useSeoMeta({
  title: computed(() =>
    application.value
      ? `${application.value.candidate.firstName} ${application.value.candidate.lastName} → ${application.value.job.title} — Factory Careers`
      : 'Application — Factory Careers',
  ),
})

const showInterviewSidebar = ref(false)

const { allowedTransitions, isTransitioning, transitionToStatus } = useApplicationStatusActions({
  application,
  updateStatus: status => updateApplication({ status: status as any }),
})

const {
  isEditingNotes,
  notesInput,
  isSavingNotes,
  notesSaveStatus,
  startEditNotes,
  saveNotes,
  autosaveNotes,
  finishEditNotes,
} = useEditableApplicationNotes({
  application,
  focusOnEdit: true,
  save: notes => updateApplication({ notes }),
})

function openInterviewScheduler() {
  showInterviewSidebar.value = true
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl">
    <!-- Back link -->
    <AppBackLink
      :to="$localePath('/dashboard/applications')"
      class="mb-4"
    >
      Back to Applications
    </AppBackLink>

    <!-- Loading -->
    <div v-if="fetchStatus === 'pending'" class="text-center py-12 text-surface-400">
      Loading application…
    </div>

    <!-- Error / not found -->
    <div
      v-else-if="error"
      class="border border-danger-500/45 bg-danger-500/10 p-4 text-sm text-danger-200"
    >
      {{ error.statusCode === 404 ? 'Application not found.' : 'Failed to load application.' }}
      <NuxtLink :to="$localePath('/dashboard/applications')" class="underline ml-1">Back to Applications</NuxtLink>
    </div>

    <!-- Application detail -->
    <template v-else-if="application">
      <!-- Header -->
      <div class="relative mb-4 ui-panel ui-dashboard-panel p-5">
        <div class="flex flex-col gap-4 sm:pr-56">
          <div class="min-w-0">
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-surface-500 dark:text-surface-400">
              Application Overview
            </p>
            <div class="mb-3 flex flex-wrap items-center gap-2 text-surface-400">
              <h1 class="truncate text-2xl font-bold text-surface-900 dark:text-surface-50">
                {{ formatCandidateName(application.candidate) }}
              </h1>
              <span class="text-surface-400">→</span>
              <NuxtLink
                :to="$localePath(`/dashboard/jobs/${application.job.id}`)"
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
      <div class="mb-6 ui-panel ui-dashboard-panel p-3">
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

      <div class="grid gap-4 md:grid-cols-2">
        <!-- Candidate info -->
        <div class="ui-panel ui-dashboard-panel p-5">
          <div class="flex items-center gap-2 mb-3">
            <User class="size-4 text-surface-500 dark:text-surface-400" />
            <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Candidate</h2>
          </div>
          <dl class="grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt class="text-surface-400">Name</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">
                <NuxtLink
                  :to="$localePath(`/dashboard/candidates/${application.candidate.id}`)"
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
        <div class="ui-panel ui-dashboard-panel p-5">
          <div class="flex items-center gap-2 mb-3">
            <Briefcase class="size-4 text-surface-500 dark:text-surface-400" />
            <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Job</h2>
          </div>
          <dl class="grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt class="text-surface-400">Title</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">
                <NuxtLink
                  :to="$localePath(`/dashboard/jobs/${application.job.id}`)"
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

        <ApplicationScoringPanel
          surface="page"
          :application-id="applicationId"
          :score="application.score"
          :analysis-run-id="scoringData?.latestRun?.id ?? null"
          :scoring-summary="scoringSummary"
          :scoring-summary-fallback="scoringSummaryFallback"
          :is-scoring="isScoringApplication"
          full-width
          @score="scoreCurrentApplication"
        />
      </div>

      <ApplicationNotesPanel
        surface="page"
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

      <!-- Custom properties (Notion-style) -->
      <div class="ui-panel ui-dashboard-panel p-4 mb-4">
        <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-2 px-2">Properties</h2>
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
        surface="page"
        :responses="application.responses"
      />
    </template>
  </div>

  <!-- Interview Schedule Sidebar -->
  <InterviewScheduleSidebar
    v-if="showInterviewSidebar && application"
    :application-id="applicationId"
    :candidate-name="`${application.candidate.firstName} ${application.candidate.lastName}`"
    :job-title="application.job.title"
    @close="showInterviewSidebar = false"
    @scheduled="showInterviewSidebar = false"
  />
</template>