<script setup lang="ts">
import {
  X, User, Calendar, Hash, FileText,
  ExternalLink, Phone, Upload, Brain, History,
} from 'lucide-vue-next'
import {
  getApplicationTransitionButtonClass,
  getApplicationTransitionLabel,
} from '~/utils/status-display'
import { formatPhoneNumber } from '~/utils/phone-format'
import type { ApplicationStatus } from '~~/shared/application-status'


const props = defineProps<{
  applicationId: string
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

const { track } = useTrack()
const { formatCandidateName } = useOrgSettings()

// Detect if the job sub-nav bar is visible (adds 40px / 2.5rem)
const route = useRoute()
const getRouteBaseName = useRouteBaseName()
const hasSubNav = computed(() => {
  const baseName = getRouteBaseName(route)
  if (typeof baseName !== 'string') return false
  const idParam = route.params.id
  return baseName.startsWith('dashboard-jobs-id') && typeof idParam === 'string' && idParam !== 'new'
})

// ─────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────

const activeTab = ref<'overview' | 'documents' | 'responses' | 'ai_analysis' | 'timeline'>('overview')
const sidebarRef = ref<HTMLElement | null>(null)

// ─────────────────────────────────────────────
// Application detail
// ─────────────────────────────────────────────

const { application, status: fetchStatus, refresh, updateApplication } = useApplication(() => props.applicationId)

// ─────────────────────────────────────────────
// Fetch full candidate detail (for documents)
// ─────────────────────────────────────────────

const candidateId = computed(() => application.value?.candidate?.id ?? null)

const { data: candidateData, refresh: refreshCandidate } = useFetch(
  () => candidateId.value ? `/api/candidates/${candidateId.value}` : null!,
  {
    key: computed(() => `sidebar-candidate-${candidateId.value}`),
    headers: useRequestHeaders(['cookie']),
    watch: [candidateId],
    immediate: false,
  },
)

// Fetch candidate data when application loads
watch(candidateId, (id) => {
  if (id) refreshCandidate()
}, { immediate: true })

const documents = computed(() => candidateData.value?.documents ?? [])

const { allowedTransitions, isTransitioning, transitionToStatus } = useApplicationStatusActions({
  application,
  updateStatus: status => updateApplication({ status: status as ApplicationStatus }),
  trackTransition: ({ fromStatus, toStatus }) => {
    track('sidebar_status_changed', {
      application_id: props.applicationId,
      from_status: fromStatus,
      to_status: toStatus,
    })
  },
  afterTransition: async () => {
    emit('updated')
  },
})

const { isEditingNotes, notesInput, isSavingNotes, notesSaveStatus, startEditNotes, saveNotes, autosaveNotes, finishEditNotes } = useEditableApplicationNotes({
  application,
  save: notes => updateApplication({ notes }),
  afterSave: async () => {
    emit('updated')
  },
})

// ─────────────────────────────────────────────
// Documents — upload, download, preview, delete
// ─────────────────────────────────────────────

const {
  fileInput,
  selectedDocType,
  isUploading,
  showDocDeleteConfirm,
  isDeletingDoc,
  reparsingDocId,
  documentPreview,
  documentPreviewState,
  triggerFileSelect,
  handleFileSelected,
  handleReparse,
  handleDownload,
  handleDeleteDoc,
} = useApplicationDocumentActions({
  candidateId,
  documents: () => documents.value,
  afterMutation: refreshCandidate,
})

// ─────────────────────────────────────────────
// Escape key to close (layered: preview → delete → sidebar)
// ─────────────────────────────────────────────

function closeTopLayer() {
  if (documentPreview.showPreview.value) {
    documentPreview.closePreview()
  } else if (showDocDeleteConfirm.value) {
    showDocDeleteConfirm.value = null
  } else {
    emit('close')
  }
}

useFocusTrap({
  root: sidebarRef,
  active: computed(() => props.open),
  onEscape: closeTopLayer,
})

// ─────────────────────────────────────────────
// Timeline data for the candidate
// ─────────────────────────────────────────────

const {
  timelineItems,
  timelineLoading,
  timelineError,
  timelineLoaded,
  loadTimeline,
  resetTimeline,
} = useApplicationTimeline({ candidateId })

// Load timeline data lazily when tab is selected
watch(activeTab, (tab) => {
  if (tab === 'timeline' && !timelineLoaded.value && candidateId.value) {
    loadTimeline()
  }
})

// Reset state when switching to a different application
watch(() => props.applicationId, () => {
  isEditingNotes.value = false
  activeTab.value = 'overview'
  showDocDeleteConfirm.value = null
  resetTimeline()
  documentPreview.closePreview()
})

const responsesCount = computed(() => application.value?.responses?.length ?? 0)

// ─────────────────────────────────────────────
// Interview scheduling & existing interviews
// ─────────────────────────────────────────────

const showScheduleSidebar = ref(false)

const { interviews: applicationInterviews } = useInterviews({
  applicationId: computed(() => props.applicationId),
})


</script>

<template>
  <Transition name="slide">
    <aside
      ref="sidebarRef"
      v-if="open"
      class="ui-drawer-panel fixed right-0 z-40 w-full sm:w-[640px] sm:max-w-[calc(100vw-4rem)] flex flex-col"
      :class="hasSubNav ? 'top-24 h-[calc(100vh-6rem)]' : 'top-14 h-[calc(100vh-3.5rem)]'"
      role="dialog"
      aria-modal="true"
      aria-label="Candidate detail"
    >
      <!-- Header -->
      <div class="ui-drawer-header flex items-center justify-between px-4 sm:px-6 py-4 shrink-0">
        <div v-if="application" class="min-w-0 flex-1">
          <div class="flex items-center gap-3">
            <div class="ui-avatar ui-avatar-brand size-10 text-sm">
              {{ application.candidate.firstName[0] }}{{ application.candidate.lastName[0] }}
            </div>
            <div class="min-w-0">
              <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-50 truncate">
                {{ formatCandidateName(application.candidate) }}
              </h2>
              <div class="flex items-center gap-3 text-sm text-surface-500 dark:text-surface-400">
                <CopyEmailButton :email="application.candidate.email" class="ui-inline-link-brand truncate" />
                <span v-if="application.candidate.phone" class="inline-flex items-center gap-1">
                  <Phone class="size-3.5 shrink-0" />
                  {{ formatPhoneNumber(application.candidate.phone) }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="min-w-0">
          <h2 class="text-lg font-semibold text-surface-400">Loading…</h2>
        </div>
        <div class="flex items-center gap-1 shrink-0 ml-3">
          <button
            v-if="application"
            class="ui-button ui-button-secondary gap-1.5 px-2.5 py-1.5 text-sm"
            title="Schedule Interview"
            @click="showScheduleSidebar = true"
          >
            <Calendar class="size-3.5" />
            Schedule
          </button>
          <button
            class="ui-button ui-button-ghost ui-panel-close-button p-1.5"
            title="Close (Esc)"
            @click="emit('close')"
          >
            <X class="size-5" />
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div v-if="application" class="ui-drawer-tabs px-4 sm:px-6 shrink-0">
        <div class="flex gap-1 overflow-x-auto scrollbar-none">
          <button
            class="ui-tab cursor-pointer px-3 py-2.5 text-sm font-medium -mb-px"
            :class="activeTab === 'overview'
              ? 'ui-tab-active'
              : 'ui-tab-inactive'"
            @click="activeTab = 'overview'"
          >
            Overview
          </button>
          <button
            class="ui-tab cursor-pointer px-3 py-2.5 text-sm font-medium -mb-px"
            :class="activeTab === 'documents'
              ? 'ui-tab-active'
              : 'ui-tab-inactive'"
            @click="activeTab = 'documents'"
          >
            Documents ({{ documents.length }})
          </button>
          <button
            v-if="responsesCount > 0"
            class="ui-tab cursor-pointer px-3 py-2.5 text-sm font-medium -mb-px"
            :class="activeTab === 'responses'
              ? 'ui-tab-active'
              : 'ui-tab-inactive'"
            @click="activeTab = 'responses'"
          >
            Responses ({{ responsesCount }})
          </button>
          <button
            class="ui-tab cursor-pointer px-3 py-2.5 text-sm font-medium -mb-px inline-flex items-center gap-1.5"
            :class="activeTab === 'ai_analysis'
              ? 'ui-tab-active'
              : 'ui-tab-inactive'"
            @click="activeTab = 'ai_analysis'"
          >
            <Brain class="size-3.5" />
            AI
          </button>
          <button
            class="ui-tab cursor-pointer px-3 py-2.5 text-sm font-medium -mb-px inline-flex items-center gap-1.5"
            :class="activeTab === 'timeline'
              ? 'ui-tab-active'
              : 'ui-tab-inactive'"
            @click="activeTab = 'timeline'"
          >
            <History class="size-3.5" />
            Timeline
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="ui-drawer-body flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <!-- Loading -->
        <div v-if="fetchStatus === 'pending'" class="text-center py-12 text-surface-400">
          Loading details…
        </div>

        <template v-else-if="application">

          <!-- ═══════════════════════════════════════ -->
          <!-- OVERVIEW TAB                            -->
          <!-- ═══════════════════════════════════════ -->
          <div v-if="activeTab === 'overview'" class="space-y-5">
            <!-- Status & transitions -->
            <div>
              <div class="flex items-center gap-2 mb-3">
                <ApplicationStatusBadge :status="application.status" />
                <ApplicationTimestampStack
                  :applied-at="application.createdAt"
                  :updated-at="application.updatedAt"
                />
              </div>

              <div v-if="allowedTransitions.length > 0" class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-medium text-surface-500 dark:text-surface-400 mr-0.5">Move to:</span>
                <button
                  v-for="nextStatus in allowedTransitions"
                  :key="nextStatus"
                  :disabled="isTransitioning"
                  class="ui-button inline-flex items-center gap-1.5 px-3 py-1.5 text-sm disabled:opacity-50"
                  :class="getApplicationTransitionButtonClass(nextStatus)"
                  @click="transitionToStatus(nextStatus)"
                >
                  <ApplicationTransitionIcon :status="nextStatus" />
                  {{ getApplicationTransitionLabel(nextStatus) }}
                </button>
              </div>
            </div>

            <!-- Candidate info -->
            <div class="ui-panel p-5">
              <div class="flex items-center gap-2.5 mb-4">
                <div class="ui-icon-state ui-icon-state-brand size-7 rounded-lg">
                  <User class="size-3.5" />
                </div>
                <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Candidate</h3>
              </div>
              <dl class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt class="text-xs font-medium text-surface-400 dark:text-surface-500 mb-1">Name</dt>
                  <dd class="text-surface-800 dark:text-surface-200 font-medium">
                    {{ formatCandidateName(application.candidate) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs font-medium text-surface-400 dark:text-surface-500 mb-1">Email</dt>
                  <dd class="text-surface-800 dark:text-surface-200 font-medium truncate">
                    <CopyEmailButton :email="application.candidate.email" :show-icon="false" class="ui-inline-link-brand max-w-full" />
                  </dd>
                </div>
                <div v-if="application.candidate.phone">
                  <dt class="text-xs font-medium text-surface-400 dark:text-surface-500 mb-1">Phone</dt>
                  <dd class="text-surface-800 dark:text-surface-200 font-medium">
                    {{ formatPhoneNumber(application.candidate.phone) }}
                  </dd>
                </div>
              </dl>
            </div>

            <!-- Application details -->
            <div class="ui-panel p-5">
              <div class="flex items-center gap-2.5 mb-4">
                <div class="ui-icon-state ui-icon-state-info size-7 rounded-lg">
                  <Hash class="size-3.5" />
                </div>
                <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Details</h3>
              </div>
              <dl class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt class="text-xs font-medium text-surface-400 dark:text-surface-500 mb-1">Score</dt>
                  <dd class="text-surface-800 dark:text-surface-200 font-medium">
                    {{ application.score ?? '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs font-medium text-surface-400 dark:text-surface-500 mb-1">Status</dt>
                  <dd>
                    <ApplicationStatusBadge :status="application.status" />
                  </dd>
                </div>
                <div>
                  <dt class="sr-only">Application timestamps</dt>
                  <dd>
                    <ApplicationTimestampStack
                      :applied-at="application.createdAt"
                      :updated-at="application.updatedAt"
                      class="items-start sm:items-start"
                    />
                  </dd>
                </div>
              </dl>
            </div>

            <ApplicationNotesPanel
              surface="sidebar"
              :notes="application.notes"
              :is-editing-notes="isEditingNotes"
              :notes-input="notesInput"
              :is-saving-notes="isSavingNotes"
              :notes-save-status="notesSaveStatus"
              @update:notes-input="notesInput = $event"
              @start-edit="startEditNotes"
              @autosave="autosaveNotes"
              @save="saveNotes"
              @finish-edit="finishEditNotes"
            />

            <ApplicationInterviewsPanel
              surface="sidebar"
              :interviews="applicationInterviews"
            />

            <!-- Quick links -->
            <div class="flex items-center gap-4 pt-1">
              <NuxtLink
                :to="$localePath(`/dashboard/candidates/${application.candidate.id}`)"
                class="ui-inline-link-brand inline-flex items-center gap-1.5 text-sm font-medium"
              >
                <ExternalLink class="size-3.5" />
                Full candidate profile
              </NuxtLink>
              <NuxtLink
                :to="$localePath(`/dashboard/applications/${application.id}`)"
                class="ui-inline-link-brand inline-flex items-center gap-1.5 text-sm font-medium"
              >
                <ExternalLink class="size-3.5" />
                Full application page
              </NuxtLink>
            </div>
          </div>

          <!-- ═══════════════════════════════════════ -->
          <!-- DOCUMENTS TAB                           -->
          <!-- ═══════════════════════════════════════ -->
          <div v-if="activeTab === 'documents'">
            <input
              ref="fileInput"
              type="file"
              accept=".pdf,.doc,.docx"
              class="hidden"
              @change="handleFileSelected"
            />

            <ApplicationDocumentsPanel
              :documents="documents"
              :preview="documentPreviewState"
              surface="sidebar"
              allow-reparse
              :reparsing-doc-id="reparsingDocId"
              empty-description="Upload a resume, cover letter, or other document (PDF, DOC, DOCX — max 10 MB)."
              @preview="documentPreview.handlePreview"
              @download="handleDownload"
              @delete="showDocDeleteConfirm = $event"
              @reparse="handleReparse"
              @close-preview="documentPreview.closePreview"
            >
              <template #toolbar>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <FactorySelect
                      v-model="selectedDocType"
                      class="w-40"
                      :options="[
                        { value: 'resume', label: 'Resume' },
                        { value: 'cover_letter', label: 'Cover Letter' },
                        { value: 'other', label: 'Other' },
                      ]"
                    />
                  </div>
                  <button
                    :disabled="isUploading"
                    class="ui-button ui-button-secondary gap-1.5 px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    @click="triggerFileSelect"
                  >
                    <Upload class="size-3.5" />
                    {{ isUploading ? 'Uploading…' : 'Upload Document' }}
                  </button>
                </div>
              </template>
            </ApplicationDocumentsPanel>
          </div>
          <!-- ═══════════════════════════════════════ -->
          <!-- RESPONSES TAB                           -->
          <!-- ═══════════════════════════════════════ -->
          <ApplicationResponsesPanel
            v-if="activeTab === 'responses'"
            surface="sidebar"
            :responses="application.responses ?? []"
          />

          <!-- ═══════════════════════════════════════ -->
          <!-- AI ANALYSIS TAB                         -->
          <!-- ═══════════════════════════════════════ -->
          <div v-if="activeTab === 'ai_analysis'">
            <ScoreBreakdown :application-id="props.applicationId" @scored="refresh(); emit('updated')" />
          </div>

          <!-- ═══════════════════════════════════════ -->
          <!-- TIMELINE TAB                            -->
          <!-- ═══════════════════════════════════════ -->
          <ApplicationTimelinePanel
            v-if="activeTab === 'timeline'"
            :items="timelineItems"
            :loading="timelineLoading"
            :error="timelineError"
            @retry="loadTimeline"
          />

        </template>
      </div>
    </aside>
  </Transition>

  <!-- Interview Schedule Sidebar -->
  <InterviewScheduleSidebar
    v-if="showScheduleSidebar && application"
    :application-id="props.applicationId"
    :candidate-name="formatCandidateName(application.candidate)"
    :job-title="application.job?.title ?? ''"
    @close="showScheduleSidebar = false"
    @scheduled="showScheduleSidebar = false"
  />



  <ConfirmDialog
    v-if="showDocDeleteConfirm"
    title="Delete Document"
    message="Are you sure you want to delete this document? This action cannot be undone."
    confirm-label="Delete"
    loading-label="Deleting…"
    variant="danger"
    :loading="isDeletingDoc"
    aria-label="Delete document"
    @close="showDocDeleteConfirm = null"
    @confirm="handleDeleteDoc(showDocDeleteConfirm!)"
  />
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.2s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
