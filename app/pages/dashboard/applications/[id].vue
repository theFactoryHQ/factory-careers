<script setup lang="ts">
import { User, Briefcase, Calendar, Clock, FileText, MessageSquare, Brain, Loader2 } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import {
  getApplicationTransitionActionLabel,
  getApplicationTransitionButtonClass,
} from '~/utils/status-display'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const applicationId = route.params.id as string
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()

type ApplicationScoresResponse = {
  compositeScore: number | null
  scores: Array<{
    criterionKey: string
    maxScore: number
    score: number
    confidence: number
    evidence: string
    strengths: string[] | null
    gaps: string[] | null
    criterionName: string | null
    weight: number | null
    category: string | null
  }>
  latestRun: {
    id: string
    status: string
    provider: string
    model: string
    compositeScore: number | null
    promptTokens: number | null
    completionTokens: number | null
    createdAt: string
    summary: string | null
  } | null
}

const { application, status: fetchStatus, error, refresh, updateApplication } = useApplication(applicationId)
const { isScoringApplication, scoreApplicationCandidate } = useApplicationScoring()
const { data: scoringData, refresh: refreshScoring } = useFetch<ApplicationScoresResponse>(
  `/api/applications/${applicationId}/scores`,
  {
    key: `application-scores-${applicationId}`,
    headers: useRequestHeaders(['cookie']),
  },
)

const { formatCandidateName } = useOrgSettings()

useSeoMeta({
  title: computed(() =>
    application.value
      ? `${application.value.candidate.firstName} ${application.value.candidate.lastName} → ${application.value.job.title} — Factory Careers`
      : 'Application — Factory Careers',
  ),
})

// ─────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────
import { APPLICATION_STATUS_TRANSITIONS } from '~~/shared/status-transitions'

const allowedTransitions = computed(() => {
  if (!application.value) return []
  return APPLICATION_STATUS_TRANSITIONS[application.value.status] ?? []
})

const isTransitioning = ref(false)
const showInterviewSidebar = ref(false)
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

async function handleTransition(newStatus: string) {
  isTransitioning.value = true
  try {
    await updateApplication({ status: newStatus as any })
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to update status', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isTransitioning.value = false
  }
}

// ─────────────────────────────────────────────
// Notes editing
// ─────────────────────────────────────────────

const isEditingNotes = ref(false)
const notesInput = ref('')
const isSavingNotes = ref(false)
const notesTextarea = ref<HTMLTextAreaElement | null>(null)

async function startEditNotes() {
  notesInput.value = application.value?.notes ?? ''
  isEditingNotes.value = true
  await nextTick()
  notesTextarea.value?.focus()
}

async function saveNotes() {
  isSavingNotes.value = true
  try {
    await updateApplication({ notes: notesInput.value || null })
    isEditingNotes.value = false
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to save notes', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isSavingNotes.value = false
  }
}

async function scoreCurrentApplication() {
  if (!application.value) return
  await scoreApplicationCandidate(applicationId, {
    refresh,
    jobId: application.value.job.id,
    source: 'application_detail_page',
  })
  await refreshScoring()
}

// ─────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────

function formatResponseValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value ?? '—')
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
            @click="handleTransition(nextStatus)"
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
                <a
                  :href="`mailto:${application.candidate.email}`"
                  target="_blank"
                  class="hover:text-brand-600 dark:hover:text-brand-400 hover:underline cursor-pointer transition-colors"
                >{{ application.candidate.email }}</a>
              </dd>
            </div>
            <div v-if="application.candidate.phone">
              <dt class="text-surface-400">Phone</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">{{ application.candidate.phone }}</dd>
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

        <!-- Application scoring -->
        <div class="ui-panel ui-dashboard-panel p-5 md:col-span-2">
          <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex items-center gap-2">
              <Brain class="size-4 text-surface-500 dark:text-surface-400" />
              <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Scoring</h2>
            </div>
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

          <dl class="grid gap-5 text-sm md:grid-cols-[10rem_minmax(0,1fr)]">
            <div>
              <dt class="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500 dark:text-surface-500">Score</dt>
              <dd class="mt-2 text-2xl font-semibold text-surface-900 dark:text-white">
                {{ application.score != null ? application.score : '—' }}
                <span v-if="application.score != null" class="ml-1 text-sm font-medium text-surface-500 dark:text-surface-500">
                  pts
                </span>
              </dd>
            </div>
            <div>
              <dt class="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500 dark:text-surface-500">
                AI summary
              </dt>
              <dd
                v-if="scoringSummary"
                class="mt-2 max-w-3xl text-sm leading-6 text-surface-700 dark:text-surface-300"
              >
                {{ scoringSummary }}
              </dd>
              <dd
                v-else
                class="mt-2 max-w-3xl text-sm leading-6 text-surface-500 dark:text-surface-500"
              >
                {{ scoringSummaryFallback }}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Notes -->
      <div class="mt-4 ui-panel ui-dashboard-panel p-5 mb-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <MessageSquare class="size-4 text-surface-500 dark:text-surface-400" />
            <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Notes</h2>
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
          />
          <div class="flex items-center gap-2 mt-2">
            <button
              :disabled="isSavingNotes"
              class="factory-button-cta factory-button-premium cursor-pointer px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              @click="saveNotes"
            >
              {{ isSavingNotes ? 'Saving…' : 'Save' }}
            </button>
            <button
              class="factory-toolbar-button cursor-pointer border px-3 py-1.5 text-xs font-medium text-white/78 hover:text-white transition-colors"
              @click="isEditingNotes = false"
            >
              Cancel
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

      <!-- Question Responses -->
      <div
        v-if="application.responses && application.responses.length > 0"
        class="ui-panel ui-dashboard-panel p-5"
      >
        <div class="flex items-center gap-2 mb-3">
          <FileText class="size-4 text-surface-500 dark:text-surface-400" />
          <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">
            Application Responses ({{ application.responses.length }})
          </h2>
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
