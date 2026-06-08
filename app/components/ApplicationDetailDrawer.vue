<script setup lang="ts">
import { User, Briefcase, Calendar, FileText, MessageSquare, Brain, Loader2 } from 'lucide-vue-next'
import {
  getApplicationTransitionActionLabel,
  getApplicationTransitionButtonClass,
} from '~/utils/status-display'
import { formatPhoneNumber } from '~/utils/phone-format'
import { formatResponseValue } from '~/utils/application-response-format'
import type { ScoringBand } from '~~/shared/scoring-bands'

const props = defineProps<{
  applicationId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const localePath = useLocalePath()

const { application, status: fetchStatus, error, refresh, updateApplication } = useApplication(() => props.applicationId)
const { isScoringApplication, scoreApplicationCandidate } = useApplicationScoring()
const { formatCandidateName } = useOrgSettings()

type ApplicationScoresResponse = {
  scoreBand: ScoringBand | null
  latestRun: {
    id: string
    summary: string | null
  } | null
}

const { data: scoringData, refresh: refreshScoring } = useFetch<ApplicationScoresResponse>(
  () => `/api/applications/${props.applicationId}/scores`,
  {
    key: `application-scores-${props.applicationId}`,
    headers: useRequestHeaders(['cookie']),
    watch: [() => props.applicationId],
  }
)

const scoringSummary = computed(() => {
  const summary = scoringData.value?.latestRun?.summary
  return typeof summary === 'string' ? summary.trim() : ''
})

const scoringSummaryFallback = computed(() => {
  if (application.value?.score != null) {
    return 'No AI summary was stored for this score. Re-score to generate one.'
  }
  return 'Run analysis to generate an AI scoring summary.'
})
const scoreBand = computed(() => scoringData.value?.scoreBand ?? null)

const showInterviewSidebar = ref(false)

const { allowedTransitions, isTransitioning, transitionToStatus } = useApplicationStatusActions({
  application,
  updateStatus: status => updateApplication({ status: status as any }),
})

const { isEditingNotes, notesInput, isSavingNotes, notesSaveStatus, notesTextarea, startEditNotes, saveNotes, autosaveNotes, finishEditNotes } = useEditableApplicationNotes({
  application,
  focusOnEdit: true,
  save: notes => updateApplication({ notes }),
})

async function scoreCurrentApplication() {
  if (!application.value) return
  const result = await scoreApplicationCandidate(props.applicationId, {
    refreshApplication: false,
    jobId: application.value.job.id,
    source: 'application_detail_drawer',
  })
  if (result && application.value) {
    application.value.score = result.compositeScore
  }
  await refreshScoring()
}

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
                  @click="showInterviewSidebar = true"
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

            <!-- Application scoring (matches full page layout) -->
            <div class="border border-white/12 bg-white/[0.025] p-5">
              <div class="mb-5 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Brain class="size-4 text-surface-500 dark:text-surface-400" />
                  <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Scoring</h3>
                </div>
                <div class="flex items-center gap-2">
                  <ScoringFeedbackControl
                    :application-id="applicationId"
                    :analysis-run-id="scoringData?.latestRun?.id ?? null"
                  />
                  <button
                    type="button"
                    :disabled="isScoringApplication"
                    class="factory-button-cta factory-button-premium inline-flex h-8 min-h-8 cursor-pointer items-center justify-center gap-1.5 px-2.5 py-0 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    @click="scoreCurrentApplication"
                  >
                    <Loader2 v-if="isScoringApplication" class="size-3 animate-spin" />
                    <Brain v-else class="size-3" />
                    {{ isScoringApplication ? 'Scoring...' : (application.score != null ? 'Re-score' : 'Run Analysis') }}
                  </button>
                </div>
              </div>

              <dl class="grid gap-5 text-sm md:grid-cols-[8rem_minmax(0,1fr)]">
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-[0.18em] text-surface-400">Score</dt>
                  <dd class="mt-1 flex flex-wrap items-center gap-2">
                    <span class="text-2xl font-semibold text-surface-900 dark:text-white">
                      {{ application.score != null ? application.score : '—' }}
                      <span v-if="application.score != null" class="ml-1 text-sm font-medium text-surface-400">
                        pts
                      </span>
                    </span>
                    <ScoringBandBadge :band="scoreBand" />
                  </dd>
                </div>
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-[0.18em] text-surface-400">
                    AI summary
                  </dt>
                  <dd
                    v-if="scoringSummary"
                    class="mt-1 max-w-3xl text-sm leading-6 text-surface-700 dark:text-surface-300"
                  >
                    {{ scoringSummary }}
                  </dd>
                  <dd
                    v-else
                    class="mt-1 max-w-3xl text-sm leading-6 text-surface-500 dark:text-surface-400"
                  >
                    {{ scoringSummaryFallback }}
                  </dd>
                </div>
              </dl>
            </div>

            <!-- Notes -->
            <div class="border border-white/12 bg-white/[0.025] p-5">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <MessageSquare class="size-4 text-surface-500 dark:text-surface-400" />
                  <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Notes</h3>
                </div>
                <button
                  v-if="!isEditingNotes && application.notes"
                  class="cursor-pointer text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-medium transition-colors"
                  @click="startEditNotes"
                >
                  Edit
                </button>
              </div>

              <div v-if="isEditingNotes">
                <textarea
                  ref="notesTextarea"
                  v-model="notesInput"
                  rows="4"
                  placeholder="Add notes about this application…"
                  class="w-full border border-white/16 bg-black/45 px-3 py-2 text-sm text-white placeholder:text-white/34 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-colors"
                  @input="autosaveNotes"
                  @blur="saveNotes"
                />
                <div class="flex items-center gap-2 mt-2">
                  <p class="min-w-0 flex-1 text-xs text-surface-400" role="status">
                    {{ notesSaveStatus === 'saving' || isSavingNotes ? 'Saving notes...' : notesSaveStatus === 'saved' ? 'Notes saved' : notesSaveStatus === 'error' ? 'Autosave failed' : 'Automatically saves changes' }}
                  </p>
                  <button
                    class="factory-toolbar-button cursor-pointer border px-3 py-1.5 text-xs font-medium text-white/78 hover:text-white transition-colors"
                    :disabled="isSavingNotes"
                    @click="finishEditNotes"
                  >
                    Done
                  </button>
                </div>
              </div>
              <p
                v-else-if="application.notes"
                class="text-sm text-surface-600 dark:text-surface-300 whitespace-pre-wrap"
              >
                {{ application.notes }}
              </p>
              <button
                v-else
                type="button"
                class="group flex w-full cursor-pointer items-center justify-between border border-dashed border-white/12 bg-black px-3 py-3 text-left text-sm text-surface-400 transition-colors hover:border-brand-500/70 hover:bg-brand-500/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                @click="startEditNotes"
              >
                <span class="italic">No notes yet.</span>
                <span class="text-xs font-semibold uppercase text-brand-400 transition-colors group-hover:text-brand-300">Add Notes</span>
              </button>
            </div>

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

            <!-- Question Responses -->
            <div
              v-if="application.responses && application.responses.length > 0"
              class="border border-white/12 bg-white/[0.025] p-5"
            >
              <div class="flex items-center gap-2 mb-3">
                <FileText class="size-4 text-surface-500 dark:text-surface-400" />
                <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-200">
                  Application Responses ({{ application.responses.length }})
                </h3>
              </div>
              <div class="space-y-3">
                <div
                  v-for="response in application.responses"
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
            </div>
    </template>

    <template #overlays>
      <InterviewScheduleSidebar
        v-if="showInterviewSidebar && application"
        :application-id="applicationId"
        :candidate-name="`${application.candidate.firstName} ${application.candidate.lastName}`"
        :job-title="application.job.title"
        @close="showInterviewSidebar = false"
        @scheduled="showInterviewSidebar = false"
      />
    </template>
  </AppDetailDrawerShell>
</template>
