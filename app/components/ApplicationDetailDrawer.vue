<script setup lang="ts">
import { X, ExternalLink, User, Briefcase, Calendar, Clock, Hash, FileText, MessageSquare } from 'lucide-vue-next'
import { APPLICATION_STATUS_TRANSITIONS } from '~~/shared/status-transitions'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import {
  getApplicationStatusBadgeClass,
  getApplicationTransitionButtonClass,
  getApplicationTransitionDotClass,
  getApplicationTransitionLabel,
} from '~/utils/status-display'

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
const { formatCandidateName } = useOrgSettings()

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
        class="factory-dashboard-portal ui-drawer-panel fixed inset-y-0 right-0 z-[60] w-full max-w-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Application detail"
      >
        <!-- Header -->
        <header class="ui-drawer-header flex items-center justify-between gap-3 px-5 py-4 shrink-0">
          <span class="truncate text-sm font-semibold">Application detail</span>
          <div class="flex items-center gap-2 shrink-0">
            <NuxtLink
              :to="localePath(`/dashboard/applications/${applicationId}`)"
              class="ui-button ui-button-secondary px-3 py-1.5 text-xs"
            >
              <ExternalLink class="size-3.5" />
              Open full page
            </NuxtLink>
            <button
              class="ui-button ui-button-ghost p-1.5"
              @click="emit('close')"
            >
              <X class="size-4" />
            </button>
          </div>
        </header>

        <!-- Scrollable body -->
        <div class="ui-drawer-body flex-1 overflow-y-auto p-5 space-y-4">
          <!-- Loading -->
          <div v-if="fetchStatus === 'pending'" class="ui-empty-state py-12 text-sm">
            Loading application…
          </div>

          <!-- Error -->
          <div
            v-else-if="error"
            class="ui-alert ui-alert-danger p-4 text-sm"
          >
            {{ error.statusCode === 404 ? 'Application not found.' : 'Failed to load application.' }}
          </div>

          <template v-else-if="application">
            <!-- Header card -->
            <div class="ui-panel p-5">
              <p class="mb-2 text-xs font-medium uppercase tracking-wide text-surface-500 dark:text-surface-400">
                Application Overview
              </p>
              <div class="mb-2 flex flex-wrap items-center gap-2 text-surface-400">
                <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-50 truncate">
                  {{ formatCandidateName(application.candidate) }}
                </h2>
                <span class="text-surface-400">→</span>
                <NuxtLink
                  :to="localePath(`/dashboard/jobs/${application.job.id}`)"
                  class="ui-inline-link ui-inline-link-brand text-xl truncate"
                >
                  {{ application.job.title }}
                </NuxtLink>
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <span
                  class="inline-flex items-center border px-2.5 py-0.5 text-xs font-semibold uppercase"
                  :class="getApplicationStatusBadgeClass(application.status, 'factory')"
                >
                  {{ application.status }}
                </span>
                <TimelineDateLink :date="application.createdAt" class="text-sm text-surface-500 dark:text-surface-400">
                  Applied {{ new Date(application.createdAt).toLocaleDateString() }}
                </TimelineDateLink>
              </div>
            </div>

            <!-- Quick actions -->
            <div class="ui-panel p-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="ui-pill">Quick actions</span>
                <button
                  v-for="nextStatus in allowedTransitions"
                  :key="nextStatus"
                  :disabled="isTransitioning"
                  class="inline-flex cursor-pointer items-center px-3.5 py-1.5 text-xs font-semibold uppercase transition-all duration-150 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  :class="getApplicationTransitionButtonClass(nextStatus, 'factory')"
                  @click="handleTransition(nextStatus)"
                >
                  <span
                    class="mr-2 inline-flex size-1.5 rounded-full"
                    :class="getApplicationTransitionDotClass(nextStatus)"
                  />
                  {{ getApplicationTransitionLabel(nextStatus) }}
                </button>
                <button
                  class="ui-button ui-button-secondary px-3.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  @click="showInterviewSidebar = true"
                >
                  <Calendar class="size-3.5" />
                  Schedule Interview
                </button>
              </div>
            </div>

            <!-- Candidate & Job cards -->
            <div class="grid gap-4 sm:grid-cols-2">
              <!-- Candidate info -->
              <div class="ui-panel p-5">
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
                        class="ui-inline-link ui-inline-link-brand"
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
                        class="ui-inline-link ui-inline-link-brand"
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
              <div class="ui-panel p-5">
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
                        class="ui-inline-link ui-inline-link-brand"
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

            <!-- Application details -->
            <div class="ui-panel p-5">
              <div class="flex items-center gap-2 mb-3">
                <Hash class="size-4 text-surface-500 dark:text-surface-400" />
                <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Details</h3>
              </div>
              <dl class="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt class="text-surface-400">Score</dt>
                  <dd class="text-surface-700 dark:text-surface-200 font-medium">{{ application.score ?? '—' }}</dd>
                </div>
                <div>
                  <dt class="text-surface-400">Status</dt>
                  <dd class="text-surface-700 dark:text-surface-200 font-medium capitalize">{{ application.status }}</dd>
                </div>
                <div>
                  <dt class="text-surface-400 inline-flex items-center gap-1">
                    <Calendar class="size-3.5" />
                    Applied
                  </dt>
                  <dd class="text-surface-700 dark:text-surface-200 font-medium">
                    <TimelineDateLink :date="application.createdAt">{{ new Date(application.createdAt).toLocaleDateString() }}</TimelineDateLink>
                  </dd>
                </div>
                <div>
                  <dt class="text-surface-400 inline-flex items-center gap-1">
                    <Clock class="size-3.5" />
                    Updated
                  </dt>
                  <dd class="text-surface-700 dark:text-surface-200 font-medium">
                    <TimelineDateLink :date="application.updatedAt">{{ new Date(application.updatedAt).toLocaleDateString() }}</TimelineDateLink>
                  </dd>
                </div>
              </dl>
            </div>

            <!-- Notes -->
            <div class="ui-panel p-5">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <MessageSquare class="size-4 text-surface-500 dark:text-surface-400" />
                  <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Notes</h3>
                </div>
                <button
                  v-if="!isEditingNotes && application.notes"
                  class="ui-inline-link ui-inline-link-brand text-xs font-medium"
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
                  class="ui-field"
                />
                <div class="flex items-center gap-2 mt-2">
                  <button
                    :disabled="isSavingNotes"
                    class="ui-button ui-button-primary px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    @click="saveNotes"
                  >
                    {{ isSavingNotes ? 'Saving…' : 'Save' }}
                  </button>
                  <button
                    class="ui-button ui-button-secondary px-3 py-1.5 text-xs"
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
                class="ui-empty-panel group flex w-full cursor-pointer items-center justify-between p-3 text-left text-sm"
                @click="startEditNotes"
              >
                <span class="italic">No notes yet.</span>
                <span class="ui-inline-link ui-inline-link-brand text-xs font-semibold uppercase">Add Notes</span>
              </button>
            </div>

            <!-- Properties -->
            <div class="ui-panel p-4">
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
              class="ui-panel p-5"
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
                  class="ui-panel-divider pt-3 first:border-t-0 first:pt-0"
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
