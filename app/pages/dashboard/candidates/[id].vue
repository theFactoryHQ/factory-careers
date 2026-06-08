<script setup lang="ts">
import { Pencil, Trash2, Upload } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import {
  candidateEditFormSchema,
  normalizeEmptyCandidateFormFields,
} from '~~/shared/schemas/candidate'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const candidateId = route.params.id as string
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()

const { candidate, status: fetchStatus, error, refresh, updateCandidate, deleteCandidate } = useCandidate(candidateId)
const { formatCandidateName } = useOrgSettings()

useSeoMeta({
  title: computed(() =>
    candidate.value
      ? `${candidate.value.firstName} ${candidate.value.lastName} — Factory Careers`
      : 'Candidate — Factory Careers',
  ),
})

// ─────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────

const activeTab = ref<'applications' | 'documents'>('applications')

// ─────────────────────────────────────────────
// Edit mode
// ─────────────────────────────────────────────

const isEditing = ref(false)
const editForm = ref({
  firstName: '',
  lastName: '',
  displayName: '',
  email: '',
  phone: '',
  gender: '' as '' | 'male' | 'female' | 'other' | 'prefer_not_to_say',
  dateOfBirth: '',
})

function startEdit() {
  if (!candidate.value) return
  editForm.value = {
    firstName: candidate.value.firstName,
    lastName: candidate.value.lastName,
    displayName: candidate.value.displayName ?? '',
    email: candidate.value.email,
    phone: candidate.value.phone ?? '',
    gender: (candidate.value.gender as '' | 'male' | 'female' | 'other' | 'prefer_not_to_say') ?? '',
    dateOfBirth: candidate.value.dateOfBirth ?? '',
  }
  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
  editErrors.value = {}
}

const isSaving = ref(false)
const editErrors = ref<Record<string, string>>({})

async function handleSave() {
  const result = candidateEditFormSchema.safeParse(normalizeEmptyCandidateFormFields(editForm.value))
  if (!result.success) {
    editErrors.value = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0]?.toString()
      if (field) editErrors.value[field] = issue.message
    }
    return
  }
  editErrors.value = {}

  isSaving.value = true
  try {
    await updateCandidate({
      firstName: editForm.value.firstName,
      lastName: editForm.value.lastName,
      displayName: editForm.value.displayName || null,
      email: editForm.value.email,
      phone: editForm.value.phone || null,
      gender: (editForm.value.gender as 'male' | 'female' | 'other' | 'prefer_not_to_say') || null,
      dateOfBirth: editForm.value.dateOfBirth || null,
    })
    isEditing.value = false
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    const message = err.data?.statusMessage ?? 'Failed to save changes'
    if (err.statusCode === 409 || err.data?.statusCode === 409) {
      editErrors.value.email = message
    } else {
      toast.error(message, { message, statusCode: err.statusCode ?? err.data?.statusCode })
    }
  } finally {
    isSaving.value = false
  }
}

// ─────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────

const isDeleting = ref(false)
const showDeleteConfirm = ref(false)

async function handleDelete() {
  isDeleting.value = true
  try {
    await deleteCandidate()
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to delete candidate', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
    isDeleting.value = false
    showDeleteConfirm.value = false
  }
}

// ─────────────────────────────────────────────
// Apply to job modal
// ─────────────────────────────────────────────

const showApplyModal = ref(false)

function handleApplied() {
  showApplyModal.value = false
  refresh()
}

// ─────────────────────────────────────────────
// Interview scheduling
// ─────────────────────────────────────────────

const showInterviewSidebar = ref(false)
const interviewTargetApp = ref<{ id: string; jobTitle: string } | null>(null)

function openScheduleInterview(app: { id: string; job: { title: string } }) {
  interviewTargetApp.value = { id: app.id, jobTitle: app.job.title }
  showInterviewSidebar.value = true
}

// ─────────────────────────────────────────────
// Documents — upload, download, delete
// ─────────────────────────────────────────────

const {
  fileInput,
  selectedDocType,
  isUploading,
  showDocDeleteConfirm,
  isDeletingDoc,
  documentPreview,
  documentPreviewState,
  triggerFileSelect,
  handleFileSelected,
  handleDeleteDoc,
} = useApplicationDocumentActions({
  candidateId,
  documents: () => candidate.value?.documents,
  trackDownloads: false,
})

</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <!-- Back link -->
    <AppBackLink
      :to="$localePath('/dashboard/candidates')"
      class="mb-6"
    >
      Back to Candidates
    </AppBackLink>

    <!-- Loading -->
    <div v-if="fetchStatus === 'pending'" class="py-12 text-center text-white/50">
      Loading candidate…
    </div>

    <!-- Error / not found -->
    <div
      v-else-if="error"
      class="border border-danger-500/45 bg-danger-500/10 p-4 text-sm text-danger-200"
    >
      {{ error.statusCode === 404 ? 'Candidate not found.' : 'Failed to load candidate.' }}
      <NuxtLink :to="$localePath('/dashboard/candidates')" class="ml-1 underline hover:text-white">Back to Candidates</NuxtLink>
    </div>

    <!-- Candidate detail -->
    <template v-else-if="candidate">
      <!-- VIEW MODE -->
      <div v-if="!isEditing">
        <CandidateDetailsCard
          class="mb-4"
          :candidate="candidate"
          :candidate-id="candidateId"
          surface="page"
          @refresh="refresh()"
        >
          <template #actions>
            <div class="flex shrink-0 items-center gap-2">
              <button
                class="factory-toolbar-button inline-flex h-10 min-h-10 cursor-pointer items-center gap-1.5 border px-3 py-0 text-xs font-medium transition-colors"
                @click="startEdit"
              >
                <Pencil class="size-3.5" />
                Edit
              </button>
              <button
                class="factory-toolbar-button inline-flex h-10 min-h-10 cursor-pointer items-center gap-1.5 border border-danger-500/45 px-3 py-0 text-xs font-medium text-danger-200 transition-colors hover:border-danger-400 hover:bg-danger-500/12 hover:text-white"
                @click="showDeleteConfirm = true"
              >
                <Trash2 class="size-3.5" />
                Delete
              </button>
            </div>
          </template>
        </CandidateDetailsCard>

        <!-- Tabs -->
        <div class="mb-4 border-b border-white/10">
          <div class="flex gap-1">
            <button
              class="-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors"
              :class="activeTab === 'applications'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-white/54 hover:border-brand-500/40 hover:text-white'"
              @click="activeTab = 'applications'"
            >
              Applications ({{ candidate.applications?.length ?? 0 }})
            </button>
            <button
              class="-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors"
              :class="activeTab === 'documents'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-white/54 hover:border-brand-500/40 hover:text-white'"
              @click="activeTab = 'documents'"
            >
              Documents ({{ candidate.documents?.length ?? 0 }})
            </button>
          </div>
        </div>

        <CandidateApplicationsPanel
          v-if="activeTab === 'applications'"
          :applications="candidate.applications ?? []"
          surface="page"
          @apply="showApplyModal = true"
          @schedule="openScheduleInterview"
        />

        <!-- Apply to Job Modal -->
        <ApplicationLinkModal
          v-if="showApplyModal"
          mode="job"
          :candidate-id="candidateId"
          @close="showApplyModal = false"
          @created="handleApplied"
        />

        <!-- Interview Schedule Sidebar -->
        <InterviewScheduleSidebar
          v-if="showInterviewSidebar && interviewTargetApp"
          :application-id="interviewTargetApp.id"
          :candidate-name="`${candidate.firstName} ${candidate.lastName}`"
          :job-title="interviewTargetApp.jobTitle"
          @close="showInterviewSidebar = false"
          @scheduled="showInterviewSidebar = false"
        />

        <!-- Documents tab -->
        <div v-if="activeTab === 'documents'">
          <input
            ref="fileInput"
            type="file"
            accept=".pdf,.doc,.docx"
            class="hidden"
            @change="handleFileSelected"
          />

          <CandidateDocumentsPanel
            :documents="candidate.documents ?? []"
            :preview="documentPreviewState"
            surface="page"
            allow-delete
            empty-description="Upload a resume, cover letter, or other document (PDF, DOC, DOCX — max 10 MB)."
            @preview="documentPreview.handlePreview"
            @download="documentPreview.handleDownload"
            @delete="showDocDeleteConfirm = $event"
            @close-preview="documentPreview.closePreview"
          >
            <template #toolbar>
              <div class="mb-3 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <FactorySelect
                    v-model="selectedDocType"
                    :options="[
                      { value: 'resume', label: 'Resume' },
                      { value: 'cover_letter', label: 'Cover Letter' },
                      { value: 'other', label: 'Other' },
                    ]"
                  />
                </div>
                <button
                  :disabled="isUploading"
                  class="factory-toolbar-button inline-flex h-10 min-h-10 cursor-pointer items-center gap-1.5 border px-3 py-0 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  @click="triggerFileSelect"
                >
                  <Upload class="size-3.5" />
                  {{ isUploading ? 'Uploading…' : 'Upload Document' }}
                </button>
              </div>
            </template>

          </CandidateDocumentsPanel>

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
        </div>
      </div>

      <!-- EDIT MODE -->
      <div v-else>
        <div class="mb-4 ui-panel ui-dashboard-panel p-5">
          <p class="mb-2 text-xs font-medium uppercase tracking-wide text-white/38">
            Candidate profile
          </p>
          <h1 class="text-2xl font-bold text-white">Edit Candidate</h1>
        </div>

        <form class="space-y-5 ui-panel ui-dashboard-panel p-5" @submit.prevent="handleSave">
          <!-- First Name -->
          <div>
            <label for="edit-firstName" class="mb-1 block text-sm font-medium text-white/70">
              First Name <span class="text-brand-400">*</span>
            </label>
            <input
              id="edit-firstName"
              v-model="editForm.firstName"
              type="text"
              class="w-full border bg-black/40 px-3 py-2 text-sm text-white transition-colors placeholder:text-white/30 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/35"
              :class="editErrors.firstName ? 'border-danger-500/60' : 'border-white/16'"
            />
            <p v-if="editErrors.firstName" class="mt-1 text-xs text-danger-300">{{ editErrors.firstName }}</p>
          </div>

          <!-- Last Name -->
          <div>
            <label for="edit-lastName" class="mb-1 block text-sm font-medium text-white/70">
              Last Name <span class="text-brand-400">*</span>
            </label>
            <input
              id="edit-lastName"
              v-model="editForm.lastName"
              type="text"
              class="w-full border bg-black/40 px-3 py-2 text-sm text-white transition-colors placeholder:text-white/30 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/35"
              :class="editErrors.lastName ? 'border-danger-500/60' : 'border-white/16'"
            />
            <p v-if="editErrors.lastName" class="mt-1 text-xs text-danger-300">{{ editErrors.lastName }}</p>
          </div>

          <!-- Email -->
          <div>
            <label for="edit-email" class="mb-1 block text-sm font-medium text-white/70">
              Email <span class="text-brand-400">*</span>
            </label>
            <input
              id="edit-email"
              v-model="editForm.email"
              type="email"
              class="w-full border bg-black/40 px-3 py-2 text-sm text-white transition-colors placeholder:text-white/30 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/35"
              :class="editErrors.email ? 'border-danger-500/60' : 'border-white/16'"
            />
            <p v-if="editErrors.email" class="mt-1 text-xs text-danger-300">{{ editErrors.email }}</p>
          </div>

          <!-- Phone -->
          <div>
            <label for="edit-phone" class="mb-1 block text-sm font-medium text-white/70">
              Phone
            </label>
            <input
              id="edit-phone"
              v-model="editForm.phone"
              type="tel"
              class="w-full border border-white/16 bg-black/40 px-3 py-2 text-sm text-white transition-colors placeholder:text-white/30 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/35"
            />
          </div>

          <!-- Display Name -->
          <div>
            <label for="edit-displayName" class="mb-1 block text-sm font-medium text-white/70">
              Display Name
              <span class="ml-1 text-xs font-normal text-white/38">(optional — overrides default name format)</span>
            </label>
            <input
              id="edit-displayName"
              v-model="editForm.displayName"
              type="text"
              placeholder="e.g. Nguyễn Văn A"
              class="w-full border border-white/16 bg-black/40 px-3 py-2 text-sm text-white transition-colors placeholder:text-white/30 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/35"
            />
          </div>

          <!-- Gender + Date of Birth -->
          <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label for="edit-gender" class="mb-1 block text-sm font-medium text-white/70">
                Gender
              </label>
              <FactorySelect
                id="edit-gender"
                v-model="editForm.gender"
                :options="[
                  { value: '', label: 'Not specified' },
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                  { value: 'other', label: 'Other' },
                  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                ]"
              />
            </div>
            <div>
              <label for="edit-dateOfBirth" class="mb-1 block text-sm font-medium text-white/70">
                Date of Birth
              </label>
              <input
                id="edit-dateOfBirth"
                v-model="editForm.dateOfBirth"
                type="date"
                :max="new Date().toISOString().split('T')[0]"
                class="w-full border bg-black/40 px-3 py-2 text-sm text-white transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/35"
                :class="editErrors.dateOfBirth ? 'border-danger-500/60' : 'border-white/16'"
              />
              <p v-if="editErrors.dateOfBirth" class="mt-1 text-xs text-danger-300">{{ editErrors.dateOfBirth }}</p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3 pt-2">
            <button
              type="submit"
              :disabled="isSaving"
              class="factory-button-cta factory-button-premium inline-flex h-10 min-h-10 cursor-pointer items-center px-4 py-0 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ isSaving ? 'Saving…' : 'Save Changes' }}
            </button>
            <button
              type="button"
              class="factory-toolbar-button inline-flex h-10 min-h-10 cursor-pointer items-center border px-4 py-0 text-xs font-medium transition-colors"
              @click="cancelEdit"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        v-if="showDeleteConfirm"
        title="Delete Candidate"
        confirm-label="Delete"
        loading-label="Deleting…"
        variant="danger"
        :loading="isDeleting"
        aria-label="Delete candidate"
        @close="showDeleteConfirm = false"
        @confirm="handleDelete"
      >
        <p class="text-sm text-surface-600 dark:text-surface-400 mb-4">
          Are you sure you want to delete <strong>{{ formatCandidateName(candidate) }}</strong>?
          This will also delete all their applications and documents. This action cannot be undone.
        </p>
      </ConfirmDialog>
    </template>
  </div>
</template>
