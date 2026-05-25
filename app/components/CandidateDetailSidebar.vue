<script setup lang="ts">
import {
  X, User, Calendar, Clock, Hash, MessageSquare, FileText,
  ExternalLink, Phone, Upload, Download, Eye, Trash2,
  ArrowLeft, AlertTriangle, Brain, History, RefreshCw,
} from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import {
  getApplicationTransitionButtonClass,
  getApplicationTransitionLabel,
} from '~/utils/status-display'
import { formatPhoneNumber } from '~/utils/phone-format'

const props = defineProps<{
  applicationId: string
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()
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

// ─────────────────────────────────────────────
// Fetch application detail
// ─────────────────────────────────────────────

const { data: application, status: fetchStatus, refresh } = useFetch(
  () => `/api/applications/${props.applicationId}`,
  {
    key: computed(() => `sidebar-application-${props.applicationId}`),
    headers: useRequestHeaders(['cookie']),
    watch: [() => props.applicationId],
  },
)

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

// ─────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────
import { APPLICATION_STATUS_TRANSITIONS } from '~~/shared/status-transitions'

const allowedTransitions = computed(() => {
  if (!application.value) return []
  return APPLICATION_STATUS_TRANSITIONS[application.value.status] ?? []
})

const isTransitioning = ref(false)

async function handleTransition(newStatus: string) {
  isTransitioning.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}`, {
      method: 'PATCH',
      body: { status: newStatus },
    })
    track('sidebar_status_changed', {
      application_id: props.applicationId,
      from_status: application.value?.status,
      to_status: newStatus,
    })
    await refresh()
    emit('updated')
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

function startEditNotes() {
  notesInput.value = application.value?.notes ?? ''
  isEditingNotes.value = true
}

async function saveNotes() {
  isSavingNotes.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}`, {
      method: 'PATCH',
      body: { notes: notesInput.value || null },
    })
    await refresh()
    emit('updated')
    isEditingNotes.value = false
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to save notes', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isSavingNotes.value = false
  }
}

// ─────────────────────────────────────────────
// Documents — upload, download, preview, delete
// ─────────────────────────────────────────────

const { uploadDocument, downloadDocument, getPreviewUrl, deleteDocument } = useDocuments()

const fileInput = ref<HTMLInputElement | null>(null)
const selectedDocType = ref<'resume' | 'cover_letter' | 'other'>('resume')
const isUploading = ref(false)
const showDocDeleteConfirm = ref<string | null>(null)
const isDeletingDoc = ref(false)
const reparsingDocId = ref<string | null>(null)

const showPreview = ref(false)
const previewUrl = ref<string | null>(null)
const previewFilename = ref('')
const previewMimeType = ref('')
const previewDocId = ref<string | null>(null)
const isLoadingPreview = ref(false)
const previewError = ref<string | null>(null)

const isPdfPreview = computed(() => previewMimeType.value === 'application/pdf')

const documentTypeLabels: Record<string, string> = {
  resume: 'Resume',
  cover_letter: 'Cover Letter',
  other: 'Other',
}

function triggerFileSelect() {
  fileInput.value?.click()
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !candidateId.value) return

  isUploading.value = true

  try {
    await uploadDocument(candidateId.value, file, selectedDocType.value)
    await refreshCandidate()
  } catch (err: any) {
    toast.error('Upload failed', { message: err.data?.statusMessage ?? err.statusMessage, statusCode: err.data?.statusCode ?? err.statusCode })
  } finally {
    isUploading.value = false
    input.value = ''
  }
}

async function handleReparse(docId: string) {
  reparsingDocId.value = docId
  try {
    await $fetch(`/api/documents/${docId}/parse`, {
      method: 'POST',
      headers: useRequestHeaders(['cookie']),
    })
    toast.add({ title: 'Resume parsed successfully', type: 'success' })
    await refreshCandidate()
  } catch (err: any) {
    toast.add({
      title: 'Parse failed',
      message: err?.data?.statusMessage ?? 'Could not extract text from this document.',
      type: 'error',
    })
  } finally {
    reparsingDocId.value = null
  }
}

async function handlePreview(docId: string, mimeType?: string) {
  // Only PDFs can be previewed inline — for DOC/DOCX, download directly
  if (mimeType && mimeType !== 'application/pdf') {
    await handleDownload(docId)
    return
  }

  previewError.value = null
  showPreview.value = true
  previewDocId.value = docId

  // Find the document name from the loaded data
  const doc = documents.value?.find((d: any) => d.id === docId)
  previewFilename.value = doc?.originalFilename ?? 'Document'
  previewMimeType.value = doc?.mimeType ?? 'application/pdf'

  // Use the API endpoint URL directly — server streams the PDF (same-origin)
  previewUrl.value = getPreviewUrl(docId)
}

function closePreview() {
  showPreview.value = false
  previewUrl.value = null
  previewFilename.value = ''
  previewMimeType.value = ''
  previewDocId.value = null
  previewError.value = null
}

async function handleDownload(docId: string) {
  try {
    track('document_downloaded', { document_id: docId })
    await downloadDocument(docId)
  } catch {
    toast.error('Failed to download document')
  }
}

async function handleDeleteDoc(docId: string) {
  if (!candidateId.value) return
  isDeletingDoc.value = true
  try {
    await deleteDocument(docId, candidateId.value)
    await refreshCandidate()
    showDocDeleteConfirm.value = null
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to delete document', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isDeletingDoc.value = false
  }
}

// ─────────────────────────────────────────────
// Escape key to close (layered: preview → delete → sidebar)
// ─────────────────────────────────────────────

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (showPreview.value) {
      closePreview()
    } else if (showDocDeleteConfirm.value) {
      showDocDeleteConfirm.value = null
    } else {
      emit('close')
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// ─────────────────────────────────────────────
// Timeline data for the candidate
// ─────────────────────────────────────────────

interface TimelineEntry {
  id: string
  action: string
  resourceType: string
  resourceId: string
  metadata: Record<string, unknown> | null
  createdAt: string
  actorName: string | null
  actorEmail: string | null
  resourceName: string | null
  jobTitle: string | null
  candidateName: string | null
}

const timelineItems = ref<TimelineEntry[]>([])
const timelineLoading = ref(false)
const timelineError = ref<string | null>(null)
const timelineLoaded = ref(false)

const timelineActionLabels: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  status_changed: 'Status changed',
  comment_added: 'Comment added',
  scored: 'Scored',
  scheduled: 'Scheduled',
}

function formatTimelineDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getTimelineActionColor(action: string): string {
  switch (action) {
    case 'created': return 'bg-green-500'
    case 'status_changed': return 'bg-blue-500'
    case 'updated': return 'bg-amber-500'
    case 'deleted': return 'bg-danger-500'
    case 'comment_added': return 'bg-violet-500'
    case 'scored': return 'bg-teal-500'
    case 'scheduled': return 'bg-brand-500'
    default: return 'bg-surface-400'
  }
}

function describeTimelineItem(item: TimelineEntry): string {
  const actor = item.actorName ?? item.actorEmail ?? 'System'
  const action = timelineActionLabels[item.action] ?? item.action
  const resource = item.resourceType

  if (item.action === 'status_changed' && item.metadata) {
    const from = item.metadata.from_status ?? item.metadata.fromStatus
    const to = item.metadata.to_status ?? item.metadata.toStatus
    if (from && to) return `${actor} changed ${resource} status from ${from} to ${to}`
  }

  if (item.action === 'scored' && item.metadata) {
    const score = item.metadata.score
    if (score != null) return `${actor} scored ${resource} — ${score} pts`
  }

  return `${actor} ${action.toLowerCase()} ${resource}`
}

async function loadTimeline() {
  if (!candidateId.value) return
  timelineLoading.value = true
  timelineError.value = null
  try {
    const result = await $fetch<{ items: TimelineEntry[] }>('/api/activity-log/candidate-timeline', {
      query: { candidateId: candidateId.value },
    })
    timelineItems.value = result.items
    timelineLoaded.value = true
  } catch (err: any) {
    timelineError.value = err?.data?.statusMessage ?? 'Failed to load timeline'
  } finally {
    timelineLoading.value = false
  }
}

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
  timelineItems.value = []
  timelineLoaded.value = false
  timelineError.value = null
  closePreview()
})

// ─────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────

function formatResponseValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value ?? '—')
}

const responsesCount = computed(() => application.value?.responses?.length ?? 0)

// ─────────────────────────────────────────────
// Interview scheduling & existing interviews
// ─────────────────────────────────────────────

const showScheduleSidebar = ref(false)

const { interviews: applicationInterviews } = useInterviews({
  applicationId: computed(() => props.applicationId),
})

const interviewTypeLabels: Record<string, string> = {
  phone: 'Phone',
  video: 'Video',
  in_person: 'In-person',
  panel: 'Panel',
  technical: 'Technical',
  take_home: 'Take-home',
}

function formatInterviewDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <Transition name="slide">
    <aside
      v-if="open"
      class="ui-drawer-panel fixed right-0 z-40 w-full sm:w-[640px] sm:max-w-[calc(100vw-4rem)] flex flex-col"
      :class="hasSubNav ? 'top-24 h-[calc(100vh-6rem)]' : 'top-14 h-[calc(100vh-3.5rem)]'"
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
                  @click="handleTransition(nextStatus)"
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

            <!-- Notes -->
            <div class="ui-panel p-5">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2.5">
                  <div class="ui-icon-state ui-icon-state-warning size-7 rounded-lg">
                    <MessageSquare class="size-3.5" />
                  </div>
                  <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Notes</h3>
                </div>
                <button
                  v-if="!isEditingNotes"
                  class="ui-inline-link-brand text-xs font-medium"
                  @click="startEditNotes"
                >
                  {{ application.notes ? 'Edit' : 'Add Notes' }}
                </button>
              </div>

              <div v-if="isEditingNotes">
                <textarea
                  v-model="notesInput"
                  rows="4"
                  placeholder="Add notes about this application…"
                  class="ui-field"
                />
                <div class="flex items-center gap-2 mt-2">
                  <button
                    :disabled="isSavingNotes"
                    class="ui-button ui-button-primary px-3 py-1.5 text-sm disabled:opacity-50"
                    @click="saveNotes"
                  >
                    {{ isSavingNotes ? 'Saving…' : 'Save' }}
                  </button>
                  <button
                    class="ui-button ui-button-secondary px-3 py-1.5 text-sm"
                    @click="isEditingNotes = false"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <p
                v-else-if="application.notes"
                class="text-sm leading-relaxed text-surface-600 dark:text-surface-300 whitespace-pre-wrap"
              >
                {{ application.notes }}
              </p>
              <p v-else class="text-sm text-surface-400 italic">No notes yet.</p>
            </div>

            <!-- Scheduled interviews -->
            <div v-if="applicationInterviews.length > 0" class="ui-panel p-5">
              <div class="flex items-center gap-2.5 mb-4">
                <div class="ui-icon-state ui-icon-state-success size-7 rounded-lg">
                  <Calendar class="size-3.5" />
                </div>
                <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Interviews</h3>
              </div>
              <div class="space-y-3">
                <div
                  v-for="iv in applicationInterviews"
                  :key="iv.id"
                  class="rounded-lg border border-surface-200/60 dark:border-surface-800/40 p-3"
                >
                  <div class="flex items-center justify-between mb-1">
                    <NuxtLink
                      :to="$localePath(`/dashboard/interviews/${iv.id}`)"
                      class="text-sm font-medium text-surface-800 dark:text-surface-200 hover:text-brand-600 dark:hover:text-brand-400 transition-colors truncate"
                    >
                      {{ iv.title }}
                    </NuxtLink>
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize shrink-0 ml-2"
                      :class="{
                        'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-400': iv.status === 'scheduled',
                        'bg-success-50 text-success-700 dark:bg-success-950/40 dark:text-success-400': iv.status === 'completed',
                        'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400': iv.status === 'cancelled' || iv.status === 'no_show',
                      }"
                    >
                      {{ iv.status === 'no_show' ? 'No show' : iv.status }}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 text-xs text-surface-400 dark:text-surface-500">
                    <span class="font-medium">{{ formatInterviewDate(iv.scheduledAt) }}</span>
                    <span class="text-surface-200 dark:text-surface-700">&middot;</span>
                    <span>{{ interviewTypeLabels[iv.type] ?? iv.type }}</span>
                    <span class="text-surface-200 dark:text-surface-700">&middot;</span>
                    <span>{{ iv.duration }} min</span>
                  </div>
                  <div class="mt-2">
                    <a
                      v-if="iv.googleCalendarEventLink"
                      :href="iv.googleCalendarEventLink"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
                    >
                      <Calendar class="size-2.5" />
                      Open in Calendar
                      <ExternalLink class="size-2" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

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
          <div v-if="activeTab === 'documents'" class="space-y-4">
            <!-- Hidden file input -->
            <input
              ref="fileInput"
              type="file"
              accept=".pdf,.doc,.docx"
              class="hidden"
              @change="handleFileSelected"
            />

            <!-- ── Inline PDF preview (replaces document list when active) ── -->
            <template v-if="showPreview">
              <!-- Preview toolbar -->
              <div class="flex items-center justify-between">
                <button
                  class="factory-toolbar-button inline-flex h-10 min-h-10 items-center gap-1.5 border px-3 py-0 text-xs font-medium transition-colors hover:bg-white hover:text-black"
                  @click="closePreview"
                >
                  <ArrowLeft class="size-3.5" />
                  Back to documents
                </button>
                <div class="flex items-center gap-1">
                  <button
                    v-if="previewDocId"
                    class="ui-button ui-button-ghost p-1.5"
                    title="Download"
                    @click="handleDownload(previewDocId!)"
                  >
                    <Download class="size-4" />
                  </button>
                </div>
              </div>

              <!-- Filename -->
              <div v-if="previewFilename" class="flex items-center gap-2">
                <FileText class="size-4 text-surface-400 shrink-0" />
                <span class="text-sm font-medium text-surface-700 dark:text-surface-200 truncate">
                  {{ previewFilename }}
                </span>
              </div>

              <!-- Error state -->
              <div
                v-if="previewError"
                class="ui-alert ui-alert-danger p-6 text-center"
              >
                <AlertTriangle class="size-8 text-danger-400 mx-auto mb-2" />
                <p class="text-sm text-danger-700 dark:text-danger-400">{{ previewError }}</p>
                <button
                  class="ui-inline-link-brand mt-3 text-sm font-medium"
                  @click="closePreview"
                >
                  Go back
                </button>
              </div>

              <!-- PDF iframe — same-origin, server streams the bytes -->
              <iframe
                v-else-if="previewUrl && isPdfPreview"
                :src="previewUrl"
                class="w-full rounded-lg border border-surface-200 dark:border-surface-800"
                style="height: calc(100vh - 280px);"
                title="Document preview"
              />
            </template>

            <!-- ── Document list (normal state) ── -->
            <template v-else>
              <!-- Upload controls -->
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

              <!-- Empty state -->
              <div
                v-if="documents.length === 0"
                class="ui-empty-panel p-8"
              >
                <div class="flex size-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800/60 mx-auto mb-3">
                  <FileText class="size-6 text-surface-400 dark:text-surface-500" />
                </div>
                <p class="text-sm font-medium text-surface-600 dark:text-surface-300">No documents yet.</p>
                <p class="text-xs text-surface-400 dark:text-surface-500 mt-1">
                  Upload a resume, cover letter, or other document (PDF, DOC, DOCX — max 10 MB).
                </p>
              </div>

              <!-- Document list -->
              <div v-else class="space-y-2">
                <div
                  v-for="doc in documents"
                  :key="doc.id"
                  class="ui-panel group flex items-center justify-between px-4 py-3 transition-colors"
                  :class="doc.mimeType === 'application/pdf' ? 'cursor-pointer hover:border-brand-300 dark:hover:border-brand-700 hover:bg-brand-50/50 dark:hover:bg-brand-950/30' : ''"
                  @click="doc.mimeType === 'application/pdf' ? handlePreview(doc.id, doc.mimeType) : undefined"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <FileText class="size-4 shrink-0" :class="doc.mimeType === 'application/pdf' ? 'text-danger-500 dark:text-danger-400' : 'text-surface-400'" />
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-surface-700 dark:text-surface-200 truncate">
                        {{ doc.originalFilename }}
                      </p>
                      <span class="text-xs text-surface-400">
                        {{ documentTypeLabels[doc.type] ?? doc.type }}
                        · {{ new Date(doc.createdAt).toLocaleDateString() }}
                        <template v-if="doc.parsed === false">
                          · <span class="text-warning-500 dark:text-warning-400">Text extraction failed</span>
                        </template>
                        <template v-else-if="doc.mimeType === 'application/pdf'"> · <span class="text-brand-500 dark:text-brand-400">Click to preview</span></template>
                      </span>
                    </div>
                  </div>
                  <div class="flex items-center gap-1 shrink-0" @click.stop>
                    <button
                      v-if="doc.parsed === false"
                      :disabled="reparsingDocId === doc.id"
                      class="ui-button ui-button-ghost p-1.5 text-warning-500 disabled:opacity-50"
                      title="Retry text extraction"
                      @click="handleReparse(doc.id)"
                    >
                      <RefreshCw class="size-4" :class="{ 'animate-spin': reparsingDocId === doc.id }" />
                    </button>
                    <button
                      v-if="doc.mimeType === 'application/pdf'"
                      class="ui-button ui-button-ghost p-1.5"
                      title="Preview PDF"
                      @click="handlePreview(doc.id, doc.mimeType)"
                    >
                      <Eye class="size-4" />
                    </button>
                    <button
                      class="ui-button ui-button-ghost p-1.5"
                      title="Download"
                      @click="handleDownload(doc.id)"
                    >
                      <Download class="size-4" />
                    </button>
                    <button
                      class="ui-button ui-button-ghost ui-button-ghost-danger p-1.5"
                      title="Delete"
                      @click="showDocDeleteConfirm = doc.id"
                    >
                      <Trash2 class="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>
          <!-- ═══════════════════════════════════════ -->
          <!-- RESPONSES TAB                           -->
          <!-- ═══════════════════════════════════════ -->
          <div v-if="activeTab === 'responses'" class="space-y-3">
            <div
              v-if="responsesCount === 0"
              class="ui-empty-panel p-8"
            >
              <div class="flex size-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800/60 mx-auto mb-3">
                <FileText class="size-6 text-surface-400 dark:text-surface-500" />
              </div>
              <p class="text-sm font-medium text-surface-600 dark:text-surface-300">No application responses.</p>
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="response in application.responses"
                :key="response.id"
                class="ui-panel p-4"
              >
                <dt class="text-xs font-semibold text-surface-400 dark:text-surface-500 mb-1.5 uppercase tracking-wider">
                  {{ response.question?.label ?? 'Unknown question' }}
                </dt>
                <dd class="text-sm text-surface-700 dark:text-surface-200 leading-relaxed">
                  {{ formatResponseValue(response.value) }}
                </dd>
              </div>
            </div>
          </div>

          <!-- ═══════════════════════════════════════ -->
          <!-- AI ANALYSIS TAB                         -->
          <!-- ═══════════════════════════════════════ -->
          <div v-if="activeTab === 'ai_analysis'">
            <ScoreBreakdown :application-id="props.applicationId" @scored="refresh(); emit('updated')" />
          </div>

          <!-- ═══════════════════════════════════════ -->
          <!-- TIMELINE TAB                            -->
          <!-- ═══════════════════════════════════════ -->
          <div v-if="activeTab === 'timeline'" class="space-y-1">
            <!-- Loading -->
            <div v-if="timelineLoading" class="text-center py-12 text-surface-400">
              <div class="size-6 rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-800 dark:border-t-brand-400 animate-spin mx-auto mb-3" />
              Loading timeline…
            </div>

            <!-- Error -->
            <div
              v-else-if="timelineError"
              class="ui-alert ui-alert-danger p-5 text-center"
            >
              <AlertTriangle class="size-6 text-danger-400 mx-auto mb-2" />
              <p class="text-sm text-danger-700 dark:text-danger-400">{{ timelineError }}</p>
              <button
                class="ui-inline-link-brand mt-3 text-sm font-medium"
                @click="loadTimeline"
              >
                Retry
              </button>
            </div>

            <!-- Empty -->
            <div
              v-else-if="timelineItems.length === 0"
              class="ui-empty-panel p-8"
            >
              <div class="flex size-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800/60 mx-auto mb-3">
                <History class="size-6 text-surface-400 dark:text-surface-500" />
              </div>
              <p class="text-sm font-medium text-surface-600 dark:text-surface-300">No activity recorded yet.</p>
              <p class="text-xs text-surface-400 dark:text-surface-500 mt-1">Activity for this candidate will appear here.</p>
            </div>

            <!-- Timeline list -->
            <div v-else>
              <div
                v-for="(item, index) in timelineItems"
                :key="item.id"
                class="flex gap-3 py-2 group"
              >
                <!-- Dot + connector -->
                <div class="flex flex-col items-center shrink-0 mt-[3px]">
                  <div
                    class="size-[9px] rounded-full ring-2 ring-white dark:ring-surface-950 shrink-0"
                    :class="getTimelineActionColor(item.action)"
                  />
                  <div
                    v-if="index < timelineItems.length - 1"
                    class="w-px flex-1 min-h-[14px] bg-surface-200 dark:bg-surface-700 mt-1"
                  />
                </div>

                <!-- Content -->
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-surface-700 dark:text-surface-200 leading-snug">
                    {{ describeTimelineItem(item) }}
                  </p>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[11px] text-surface-400 dark:text-surface-500 tabular-nums">
                      {{ formatTimelineDate(item.createdAt) }}
                    </span>
                    <span
                      v-if="item.jobTitle"
                      class="text-[10px] text-surface-400 dark:text-surface-500 bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 truncate max-w-[140px]"
                    >
                      {{ item.jobTitle }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </template>
      </div>
    </aside>
  </Transition>

  <!-- Interview Schedule Sidebar -->
  <InterviewScheduleSidebar
    v-if="showScheduleSidebar && application"
    :application-id="props.applicationId"
    :candidate-name="`${application.candidate.firstName} ${application.candidate.lastName}`"
    :job-title="application.job?.title ?? ''"
    @close="showScheduleSidebar = false"
    @scheduled="showScheduleSidebar = false"
  />



  <!-- Document delete confirmation dialog -->
  <Teleport to="body">
    <div
      v-if="showDocDeleteConfirm"
      class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50 grid place-items-center p-4"
      @click.self="showDocDeleteConfirm = null"
    >
      <div class="ui-modal-panel relative p-6 max-w-sm w-full">
        <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-50 mb-2">Delete Document</h3>
        <p class="text-sm text-surface-600 dark:text-surface-400 mb-4">
          Are you sure you want to delete this document? This action cannot be undone.
        </p>
        <div class="flex justify-end gap-2">
          <button
            :disabled="isDeletingDoc"
            class="ui-button ui-button-secondary px-3 py-1.5 text-sm"
            @click="showDocDeleteConfirm = null"
          >
            Cancel
          </button>
          <button
            :disabled="isDeletingDoc"
            class="ui-button ui-button-danger px-3 py-1.5 text-sm disabled:opacity-50"
            @click="handleDeleteDoc(showDocDeleteConfirm!)"
          >
            {{ isDeletingDoc ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
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
