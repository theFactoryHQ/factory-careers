<script setup lang="ts">
const props = defineProps<{
  candidateId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const localePath = useLocalePath()
const toast = useToast()

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
const transitionTarget = ref<{ id: string; status: string } | null>(null)
const transitioningApplicationIds = ref<Set<string>>(new Set())

async function updateTransitionTargetStatus(status: string) {
  const appId = transitionTarget.value?.id
  if (!appId) return
  await $fetch(`/api/applications/${appId}`, {
    method: 'PATCH',
    body: { status },
  })
}

const { transitionToStatus } = useApplicationStatusActions({
  application: computed(() => transitionTarget.value),
  transitionKey: computed(() => transitionTarget.value?.id),
  transitioningKeys: transitioningApplicationIds,
  updateStatus: updateTransitionTargetStatus,
  afterTransition: async () => {
    await refresh()
    await refreshNuxtData('applications')
    toast.success('Application status updated')
  },
})

function openScheduleInterview(app: { id: string; job: { title: string } }) {
  interviewTargetApp.value = { id: app.id, jobTitle: app.job.title }
  showInterviewSidebar.value = true
}

function handleApplicationTransition(app: { id: string; status: string }, status: string) {
  transitionTarget.value = app
  transitionToStatus(status)
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
</script>

<template>
  <AppDetailDrawerShell
    title="Candidate detail"
    drawer-aria-label="Candidate detail"
    :full-page-href="localePath(`/dashboard/candidates/${candidateId}`)"
    close-aria-label="Close candidate detail"
    @close="emit('close')"
  >
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

    <template #overlays>
      <ApplicationLinkModal
        v-if="showApplyModal && candidate"
        mode="job"
        :candidate-id="candidateId"
        @close="showApplyModal = false"
        @created="handleApplied"
      />

      <InterviewScheduleSidebar
        v-if="showInterviewSidebar && interviewTargetApp && candidate"
        :application-id="interviewTargetApp.id"
        :candidate-name="`${candidate.firstName} ${candidate.lastName}`"
        :job-title="interviewTargetApp.jobTitle"
        @close="showInterviewSidebar = false"
        @scheduled="showInterviewSidebar = false"
      />
    </template>
  </AppDetailDrawerShell>
</template>