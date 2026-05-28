<script setup lang="ts">
import { ExternalLink, X } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

const props = defineProps<{
  candidateId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const localePath = useLocalePath()
const toast = useToast()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()

const { candidate, status: fetchStatus, error, refresh } = useCandidate(() => props.candidateId)

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const activeTab = ref<'applications' | 'documents'>('applications')

// ─── Apply to job modal ───────────────────────────────────────────────────────

const showApplyModal = ref(false)

function handleApplied() {
  showApplyModal.value = false
  refresh()
}

// ─── Interview scheduling ─────────────────────────────────────────────────────

const showInterviewSidebar = ref(false)
const interviewTargetApp = ref<{ id: string; jobTitle: string } | null>(null)
const transitioningApplicationIds = ref<Set<string>>(new Set())
const drawerRef = ref<HTMLElement | null>(null)

function openScheduleInterview(app: { id: string; job: { title: string } }) {
  interviewTargetApp.value = { id: app.id, jobTitle: app.job.title }
  showInterviewSidebar.value = true
}

async function handleApplicationTransition(app: { id: string }, status: string) {
  if (transitioningApplicationIds.value.has(app.id)) return

  transitioningApplicationIds.value = new Set([...transitioningApplicationIds.value, app.id])
  try {
    await $fetch(`/api/applications/${app.id}`, {
      method: 'PATCH',
      body: { status },
    })
    await refresh()
    await refreshNuxtData('applications')
    toast.success('Application status updated')
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to update status', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    const nextIds = new Set(transitioningApplicationIds.value)
    nextIds.delete(app.id)
    transitioningApplicationIds.value = nextIds
  }
}

// ─── Documents ────────────────────────────────────────────────────────────────

const { downloadDocument, getPreviewUrl } = useDocuments()
const documentPreview = useDocumentPreview({
  documents: () => candidate.value?.documents,
  getPreviewUrl,
  downloadDocument,
  onDownloadError: () => toast.error('Failed to download document'),
})
const documentPreviewState = computed(() => ({
  showPreview: documentPreview.showPreview.value,
  previewUrl: documentPreview.previewUrl.value,
  previewFilename: documentPreview.previewFilename.value,
  previewDocId: documentPreview.previewDocId.value,
  previewError: documentPreview.previewError.value,
  isPdfPreview: documentPreview.isPdfPreview.value,
}))

// ─── Body scroll lock + focus handling ────────────────────────────────────────

onMounted(() => {
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.body.style.overflow = ''
})

useFocusTrap({
  root: drawerRef,
  active: true,
  onEscape: () => emit('close'),
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
        ref="drawerRef"
        class="factory-dashboard-portal fixed inset-y-0 right-0 z-[60] w-full max-w-2xl flex flex-col border-l border-white/12 bg-black text-white shadow-none"
        role="dialog"
        aria-modal="true"
        aria-label="Candidate detail"
      >
        <!-- Header -->
        <header class="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-5 py-4 shrink-0">
          <span class="truncate text-sm font-semibold text-white">Candidate detail</span>
          <div class="flex items-center gap-2 shrink-0">
            <NuxtLink
              :to="localePath(`/dashboard/candidates/${candidateId}`)"
              class="factory-toolbar-button inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium uppercase text-white/78 hover:text-white transition-colors"
            >
              <ExternalLink class="size-3.5" />
              Open full page
            </NuxtLink>
            <button
              class="ui-panel-close-button p-1.5 transition-colors"
              aria-label="Close candidate detail"
              @click="emit('close')"
            >
              <X class="size-4" />
            </button>
          </div>
        </header>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto bg-black p-5 space-y-4">
          <!-- Loading -->
          <div v-if="fetchStatus === 'pending'" class="py-12 text-center text-white/50">
            Loading candidate…
          </div>

          <!-- Error -->
          <div
            v-else-if="error"
            class="border border-danger-500/45 bg-danger-500/10 p-4 text-sm text-danger-200"
          >
            {{ error.statusCode === 404 ? 'Candidate not found.' : 'Failed to load candidate.' }}
          </div>

          <template v-else-if="candidate">
            <CandidateDetailsCard
              :candidate="candidate"
              :candidate-id="candidateId"
              surface="drawer"
              @refresh="refresh()"
            />

            <!-- Tabs -->
            <div class="border-b border-white/10">
              <div class="flex gap-1">
                <button
                  class="cursor-pointer px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
                  :class="activeTab === 'applications'
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-white/54 hover:border-brand-500/40 hover:text-white'"
                  @click="activeTab = 'applications'"
                >
                  Applications ({{ candidate.applications?.length ?? 0 }})
                </button>
                <button
                  class="cursor-pointer px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
                  :class="activeTab === 'documents'
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-white/54 hover:border-brand-500/40 hover:text-white'"
                  @click="activeTab = 'documents'"
                >
                  Documents ({{ candidate.documents?.length ?? 0 }})
                </button>
              </div>
            </div>

            <!-- Applications tab -->
            <CandidateApplicationsPanel
              v-if="activeTab === 'applications'"
              :applications="candidate.applications ?? []"
              surface="drawer"
              show-status-transitions
              :transitioning-application-ids="transitioningApplicationIds"
              @apply="showApplyModal = true"
              @schedule="openScheduleInterview"
              @transition="handleApplicationTransition"
            />

            <!-- Documents tab -->
            <CandidateDocumentsPanel
              v-if="activeTab === 'documents'"
              :documents="candidate.documents ?? []"
              :preview="documentPreviewState"
              surface="drawer"
              preview-height="60vh"
              @preview="documentPreview.handlePreview"
              @download="documentPreview.handleDownload"
              @close-preview="documentPreview.closePreview"
            />
          </template>
        </div>
      </aside>
    </Transition>

    <!-- Apply to Job Modal -->
    <ApplyToJobModal
      v-if="showApplyModal && candidate"
      :candidate-id="candidateId"
      @close="showApplyModal = false"
      @created="handleApplied"
    />

    <!-- Interview Schedule Sidebar -->
    <InterviewScheduleSidebar
      v-if="showInterviewSidebar && interviewTargetApp && candidate"
      :application-id="interviewTargetApp.id"
      :candidate-name="`${candidate.firstName} ${candidate.lastName}`"
      :job-title="interviewTargetApp.jobTitle"
      @close="showInterviewSidebar = false"
      @scheduled="showInterviewSidebar = false"
    />
  </Teleport>
</template>
