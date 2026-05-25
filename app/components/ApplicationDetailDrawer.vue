<script setup lang="ts">
import { X, ExternalLink, User, Briefcase, Calendar, Clock, FileText, MessageSquare, Brain, Loader2 } from 'lucide-vue-next'
import { APPLICATION_STATUS_TRANSITIONS } from '~~/shared/status-transitions'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
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
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()

const { application, status: fetchStatus, error, refresh, updateApplication } = useApplication(() => props.applicationId)
const { isScoringApplication, scoreApplicationCandidate } = useApplicationScoring()
const { formatCandidateName } = useOrgSettings()

type ApplicationScoresResponse = {
  latestRun: {
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

// ─── Status transitions ───────────────────────────────────────────────────────

const allowedTransitions = computed(() => {
  if (!application.value) return []
  return APPLICATION_STATUS_TRANSITIONS[application.value.status] ?? []
})

const isTransitioning = ref(false)
const showInterviewSidebar = ref(false)

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

// ─── Notes editing ────────────────────────────────────────────────────────────

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
  await scoreApplicationCandidate(props.applicationId, {
    refresh,
    jobId: application.value.job.id,
    source: 'application_detail_drawer',
  })
  await refreshScoring()
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function formatResponseValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value ?? '—')
}

// ─── Body scroll lock + keyboard handling ─────────────────────────────────────

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-[55]"
        @click="emit('close')"
      />
    </Transition>

    <!-- Panel -->
    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      leave-active-class="transition-transform duration-200 ease-in"
      enter-from-class="translate-x-full"
      leave-to-class="translate-x-full"
    >
      <aside
        class="factory-dashboard-portal fixed inset-y-0 right-0 z-[60] w-full max-w-2xl flex flex-col border-l border-white/12 bg-black text-white shadow-none"
        role="dialog"
        aria-modal="true"
        aria-label="Application detail"
      >
        <!-- Header -->
        <header class="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-5 py-4 shrink-0">
          <span class="truncate text-sm font-semibold text-white">Application detail</span>
          <div class="flex items-center gap-2 shrink-0">
            <NuxtLink
              :to="localePath(`/dashboard/applications/${applicationId}`)"
              class="factory-toolbar-button inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium uppercase text-white/78 hover:text-white transition-colors"
            >
              <ExternalLink class="size-3.5" />
              Open full page
            </NuxtLink>
            <button
              class="ui-panel-close-button p-1.5 transition-colors"
              aria-label="Close application detail"
              @click="emit('close')"
            >
              <X class="size-4" />
            </button>
          </div>
        </header>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto bg-black p-5 space-y-4">
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

              <dl class="grid gap-5 text-sm md:grid-cols-[8rem_minmax(0,1fr)]">
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-[0.18em] text-surface-400">Score</dt>
                  <dd class="mt-1 text-2xl font-semibold text-surface-900 dark:text-white">
                    {{ application.score != null ? application.score : '—' }}
                    <span v-if="application.score != null" class="ml-1 text-sm font-medium text-surface-400">
                      pts
                    </span>
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
        </div>
      </aside>
    </Transition>

    <!-- Nested interview scheduling sidebar -->
    <InterviewScheduleSidebar
      v-if="showInterviewSidebar && application"
      :application-id="applicationId"
      :candidate-name="`${application.candidate.firstName} ${application.candidate.lastName}`"
      :job-title="application.job.title"
      @close="showInterviewSidebar = false"
      @scheduled="showInterviewSidebar = false"
    />
  </Teleport>
</template>
