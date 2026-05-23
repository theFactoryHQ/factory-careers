<script setup lang="ts">
import { ArrowLeft, Pencil, Trash2, Mail, Phone, Calendar, Clock, Briefcase, FileText, Plus, Upload, Download, Eye, AlertTriangle } from 'lucide-vue-next'
import { z } from 'zod'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import { getApplicationStatusBadgeClass } from '~/utils/status-display'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const candidateId = route.params.id as string
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()

const { candidate, status: fetchStatus, error, refresh, updateCandidate, deleteCandidate } = useCandidate(candidateId)
const { formatCandidateName, formatDate } = useOrgSettings()

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

const editSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  displayName: z.string().max(200).optional(),
  email: z.string().min(1, 'Email is required').email('Invalid email address').max(255),
  phone: z.string().max(50).optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine((v) => {
      const d = new Date(v)
      return !isNaN(d.getTime()) && d.getFullYear() >= 1900 && d <= new Date()
    }, 'Must be a valid past date')
    .optional(),
})

const isSaving = ref(false)
const editErrors = ref<Record<string, string>>({})

async function handleSave() {
  const result = editSchema.safeParse({
    ...editForm.value,
    gender: editForm.value.gender || undefined,
    dateOfBirth: editForm.value.dateOfBirth || undefined,
    displayName: editForm.value.displayName || undefined,
  })
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
// Display helpers
// ─────────────────────────────────────────────

const genderLabels: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
}

const documentTypeLabels: Record<string, string> = {
  resume: 'Resume',
  cover_letter: 'Cover Letter',
  other: 'Other',
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

const { uploadDocument, downloadDocument, getPreviewUrl, deleteDocument } = useDocuments()

const fileInput = ref<HTMLInputElement | null>(null)
const selectedDocType = ref<'resume' | 'cover_letter' | 'other'>('resume')
const isUploading = ref(false)
const uploadError = ref<string | null>(null)
const showDocDeleteConfirm = ref<string | null>(null)
const isDeletingDoc = ref(false)

// Preview state
const showPreview = ref(false)
const previewUrl = ref<string | null>(null)
const previewFilename = ref('')
const previewMimeType = ref('')
const previewDocId = ref<string | null>(null)
const isLoadingPreview = ref(false)
const previewError = ref<string | null>(null)

/** Whether the current preview file is a PDF (renderable in iframe) */
const isPdfPreview = computed(() => previewMimeType.value === 'application/pdf')

async function handlePreview(docId: string, mimeType?: string) {
  // Only PDFs can be previewed inline — for DOC/DOCX, download directly
  if (mimeType && mimeType !== 'application/pdf') {
    await handleDownload(docId)
    return
  }

  previewError.value = null
  showPreview.value = true
  previewDocId.value = docId

  // Find the document name from the candidate data
  const doc = candidate.value?.documents?.find((d: any) => d.id === docId)
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

function triggerFileSelect() {
  fileInput.value?.click()
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  uploadError.value = null
  isUploading.value = true

  try {
    await uploadDocument(candidateId, file, selectedDocType.value)
  } catch (err: any) {
    const msg = err.data?.statusMessage ?? err.statusMessage ?? 'Upload failed'
    uploadError.value = msg
  } finally {
    isUploading.value = false
    // Reset input so the same file can be re-selected
    input.value = ''
  }
}

async function handleDownload(docId: string) {
  try {
    await downloadDocument(docId)
  } catch {
    toast.error('Failed to download document')
  }
}

async function handleDeleteDoc(docId: string) {
  isDeletingDoc.value = true
  try {
    await deleteDocument(docId, candidateId)
    showDocDeleteConfirm.value = null
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to delete document', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isDeletingDoc.value = false
  }
}

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
        <!-- Header -->
        <div class="mb-4 ui-panel ui-dashboard-panel p-5">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <p class="mb-2 text-xs font-medium uppercase tracking-wide text-white/38">
                Candidate profile
              </p>
              <h1 class="mb-1 truncate text-2xl font-bold text-white">
                {{ formatCandidateName(candidate) }}
              </h1>
              <div class="flex flex-col gap-1 text-sm text-white/58 sm:flex-row sm:items-center sm:gap-4">
                <a
                  :href="`mailto:${candidate.email}`"
                  target="_blank"
                  class="inline-flex cursor-pointer items-center gap-1 text-white/68 transition-colors hover:text-brand-400 hover:underline"
                >
                  <Mail class="size-3.5" />
                  {{ candidate.email }}
                </a>
                <span v-if="candidate.phone" class="inline-flex items-center gap-1 text-white/58">
                  <Phone class="size-3.5" />
                  {{ candidate.phone }}
                </span>
              </div>
            </div>

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
          </div>
        </div>

        <!-- Contact details -->
        <div class="mb-4 ui-panel ui-dashboard-panel p-5">
          <h2 class="mb-3 text-sm font-semibold text-white">Details</h2>
          <dl class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-white/38">Email</dt>
              <dd class="font-medium text-white/82">
                <a
                  :href="`mailto:${candidate.email}`"
                  target="_blank"
                  class="cursor-pointer transition-colors hover:text-brand-400 hover:underline"
                >{{ candidate.email }}</a>
              </dd>
            </div>
            <div>
              <dt class="text-white/38">Phone</dt>
              <dd class="font-medium text-white/82">
                {{ candidate.phone || '—' }}
              </dd>
            </div>
            <div v-if="candidate.gender">
              <dt class="text-white/38">Gender</dt>
              <dd class="font-medium text-white/82">
                {{ genderLabels[candidate.gender] ?? candidate.gender }}
              </dd>
            </div>
            <div v-if="candidate.dateOfBirth">
              <dt class="text-white/38">Date of Birth</dt>
              <dd class="font-medium text-white/82">
                {{ formatDate(candidate.dateOfBirth) }}
              </dd>
            </div>
            <div v-if="candidate.displayName">
              <dt class="text-white/38">Display Name</dt>
              <dd class="font-medium text-white/82">
                {{ candidate.displayName }}
              </dd>
            </div>
            <div>
              <dt class="inline-flex items-center gap-1 text-white/38">
                <Calendar class="size-3.5" />
                Created
              </dt>
              <dd class="font-medium text-white/82">
                <TimelineDateLink :date="candidate.createdAt">{{ new Date(candidate.createdAt).toLocaleDateString() }}</TimelineDateLink>
              </dd>
            </div>
            <div>
              <dt class="inline-flex items-center gap-1 text-white/38">
                <Clock class="size-3.5" />
                Updated
              </dt>
              <dd class="font-medium text-white/82">
                <TimelineDateLink :date="candidate.updatedAt">{{ new Date(candidate.updatedAt).toLocaleDateString() }}</TimelineDateLink>
              </dd>
            </div>
          </dl>
        </div>

        <!-- Custom properties (Notion-style) -->
        <div class="mb-4 ui-panel ui-dashboard-panel p-4">
          <h2 class="mb-2 px-2 text-sm font-semibold text-white">Properties</h2>
          <PropertyBlock
            entity-type="candidate"
            :entity-id="candidateId"
            :entries="(candidate.properties ?? []) as import('~~/shared/properties').PropertyEntry[]"
            @refresh="refresh()"
          />
        </div>

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

        <!-- Applications tab -->
        <div v-if="activeTab === 'applications'">
          <!-- Apply to Job button -->
          <div class="mb-3 flex justify-end">
            <button
              class="factory-toolbar-button inline-flex h-10 min-h-10 cursor-pointer items-center gap-1.5 border px-3 py-0 text-xs font-medium transition-colors"
              @click="showApplyModal = true"
            >
              <Plus class="size-3.5" />
              Apply to Job
            </button>
          </div>

          <div
            v-if="!candidate.applications?.length"
            class="ui-panel ui-dashboard-panel p-8 text-center"
          >
            <Briefcase class="mx-auto mb-2 size-8 text-white/32" />
            <p class="text-sm text-white/54">No applications yet.</p>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="app in candidate.applications"
              :key="app.id"
              class="group flex flex-col gap-2 ui-panel ui-dashboard-panel px-4 py-3 transition-all hover:border-brand-500/70 hover:bg-brand-500/10 sm:flex-row sm:items-center sm:justify-between"
            >
              <NuxtLink
                :to="$localePath(`/dashboard/applications/${app.id}`)"
                class="block min-w-0 flex-1"
              >
                <h4 class="truncate text-sm font-semibold text-white transition-colors group-hover:text-brand-400">
                  {{ app.job.title }}
                </h4>
                <span class="text-xs text-white/42">
                  Applied <TimelineDateLink :date="app.createdAt">{{ new Date(app.createdAt).toLocaleDateString() }}</TimelineDateLink>
                </span>
              </NuxtLink>
              <div class="flex shrink-0 items-center gap-2 sm:ml-3">
                <button
                  class="factory-toolbar-button inline-flex h-8 min-h-8 cursor-pointer items-center gap-1 border px-2.5 py-0 text-[10px] font-medium transition-colors"
                  title="Schedule Interview"
                  @click="openScheduleInterview(app)"
                >
                  <Calendar class="size-3" />
                  Schedule
                </button>
                <span
                  class="inline-flex shrink-0 items-center border px-2 py-0.5 text-[10px] font-semibold uppercase"
                  :class="getApplicationStatusBadgeClass(app.status, 'factory')"
                >
                  {{ app.status }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Apply to Job Modal -->
        <ApplyToJobModal
          v-if="showApplyModal"
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
            <div class="mb-3 flex items-center justify-between">
              <button
                class="factory-toolbar-button inline-flex h-10 min-h-10 cursor-pointer items-center gap-1.5 border px-3 py-0 text-xs font-medium transition-colors"
                @click="closePreview"
              >
                <ArrowLeft class="size-3.5" />
                Back to documents
              </button>
              <div class="flex items-center gap-1">
                <button
                  v-if="previewDocId"
                  class="factory-toolbar-button inline-flex size-10 min-h-10 cursor-pointer items-center justify-center border p-0 text-white/58 transition-colors hover:text-white"
                  title="Download"
                  @click="handleDownload(previewDocId!)"
                >
                  <Download class="size-4" />
                </button>
              </div>
            </div>

            <!-- Filename -->
            <div v-if="previewFilename" class="mb-3 flex items-center gap-2 ui-panel ui-dashboard-panel px-3 py-2">
              <FileText class="size-4 shrink-0 text-white/38" />
              <span class="truncate text-sm font-medium text-white/78">
                {{ previewFilename }}
              </span>
            </div>

            <!-- Error state -->
            <div
              v-if="previewError"
              class="border border-danger-500/45 bg-danger-500/10 p-6 text-center"
            >
              <AlertTriangle class="mx-auto mb-2 size-8 text-danger-300" />
              <p class="text-sm text-danger-100">{{ previewError }}</p>
              <button
                class="mt-3 cursor-pointer text-sm font-medium text-brand-400 transition-colors hover:text-white"
                @click="closePreview"
              >
                Go back
              </button>
            </div>

            <!-- PDF iframe — same-origin, server streams the bytes -->
            <iframe
              v-else-if="previewUrl && isPdfPreview"
              :src="previewUrl"
              class="w-full border border-white/12"
              style="height: 70vh;"
              title="Document preview"
            />
          </template>

          <!-- ── Document list (normal state) ── -->
          <template v-else>
            <!-- Upload controls -->
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

            <!-- Upload error -->
            <div
              v-if="uploadError"
              class="mb-3 border border-danger-500/45 bg-danger-500/10 p-3 text-sm text-danger-100"
            >
              {{ uploadError }}
              <button class="ml-1 cursor-pointer underline transition-colors hover:text-white" @click="uploadError = null">Dismiss</button>
            </div>

            <!-- Empty state -->
            <div
              v-if="!candidate.documents?.length"
              class="ui-panel ui-dashboard-panel p-8 text-center"
            >
              <FileText class="mx-auto mb-2 size-8 text-white/32" />
              <p class="text-sm text-white/54">No documents yet.</p>
              <p class="mt-1 text-xs text-white/38">
                Upload a resume, cover letter, or other document (PDF, DOC, DOCX — max 10 MB).
              </p>
            </div>

            <!-- Document list -->
            <div v-else class="space-y-2">
              <div
                v-for="doc in candidate.documents"
                :key="doc.id"
                class="group flex items-center justify-between ui-panel ui-dashboard-panel px-4 py-3 transition-colors"
                :class="doc.mimeType === 'application/pdf' ? 'cursor-pointer hover:border-brand-500/70 hover:bg-brand-500/10' : ''"
                @click="doc.mimeType === 'application/pdf' ? handlePreview(doc.id, doc.mimeType) : undefined"
              >
                <div class="flex min-w-0 items-center gap-3">
                  <FileText class="size-4 shrink-0" :class="doc.mimeType === 'application/pdf' ? 'text-danger-300' : 'text-white/38'" />
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-white/82">
                      {{ doc.originalFilename }}
                    </p>
                    <span class="text-xs text-white/42">
                      {{ documentTypeLabels[doc.type] ?? doc.type }}
                      · <TimelineDateLink :date="doc.createdAt">{{ new Date(doc.createdAt).toLocaleDateString() }}</TimelineDateLink>
                      <template v-if="doc.mimeType === 'application/pdf'"> · <span class="text-brand-400">Click to preview</span></template>
                    </span>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-1" @click.stop>
                  <button
                    v-if="doc.mimeType === 'application/pdf'"
                    class="factory-toolbar-button inline-flex size-9 min-h-9 cursor-pointer items-center justify-center border p-0 text-white/58 transition-colors hover:text-white"
                    title="Preview PDF"
                    @click="handlePreview(doc.id, doc.mimeType)"
                  >
                    <Eye class="size-4" />
                  </button>
                  <button
                    class="factory-toolbar-button inline-flex size-9 min-h-9 cursor-pointer items-center justify-center border p-0 text-white/58 transition-colors hover:text-white"
                    title="Download"
                    @click="handleDownload(doc.id)"
                  >
                    <Download class="size-4" />
                  </button>
                  <button
                    class="factory-toolbar-button inline-flex size-9 min-h-9 cursor-pointer items-center justify-center border p-0 text-danger-200 transition-colors hover:border-danger-400 hover:bg-danger-500/12 hover:text-white"
                    title="Delete"
                    @click="showDocDeleteConfirm = doc.id"
                  >
                    <Trash2 class="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- Document delete confirmation dialog -->
          <Teleport to="body">
            <div v-if="showDocDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center">
              <div class="absolute inset-0 bg-black/75 backdrop-blur-[1px]" @click="showDocDeleteConfirm = null" />
              <div class="factory-dashboard-portal relative mx-4 w-full max-w-sm border border-white/12 bg-black p-6 text-white shadow-2xl shadow-black/70">
                <h3 class="mb-2 text-lg font-semibold text-white">Delete Document</h3>
                <p class="mb-4 text-sm text-white/60">
                  Are you sure you want to delete this document? This action cannot be undone.
                </p>
                <div class="flex justify-end gap-2">
                  <button
                    :disabled="isDeletingDoc"
                    class="factory-toolbar-button inline-flex h-10 min-h-10 cursor-pointer items-center border px-3 py-0 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    @click="showDocDeleteConfirm = null"
                  >
                    Cancel
                  </button>
                  <button
                    :disabled="isDeletingDoc"
                    class="factory-button-cta inline-flex h-10 min-h-10 cursor-pointer items-center border border-danger-500/60 bg-danger-600 px-3 py-0 text-xs font-medium text-white transition-colors hover:bg-danger-500 disabled:cursor-not-allowed disabled:opacity-50"
                    @click="handleDeleteDoc(showDocDeleteConfirm!)"
                  >
                    {{ isDeletingDoc ? 'Deleting…' : 'Delete' }}
                  </button>
                </div>
              </div>
            </div>
          </Teleport>
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

      <!-- Delete confirmation dialog -->
      <Teleport to="body">
        <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-black/75 backdrop-blur-[1px]" @click="showDeleteConfirm = false" />
          <div class="factory-dashboard-portal relative mx-4 w-full max-w-sm border border-white/12 bg-black p-6 text-white shadow-2xl shadow-black/70">
            <h3 class="mb-2 text-lg font-semibold text-white">Delete Candidate</h3>
            <p class="mb-4 text-sm text-white/60">
              Are you sure you want to delete <strong>{{ formatCandidateName(candidate) }}</strong>?
              This will also delete all their applications and documents. This action cannot be undone.
            </p>
            <div class="flex justify-end gap-2">
              <button
                :disabled="isDeleting"
                class="factory-toolbar-button inline-flex h-10 min-h-10 cursor-pointer items-center border px-3 py-0 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                @click="showDeleteConfirm = false"
              >
                Cancel
              </button>
              <button
                :disabled="isDeleting"
                class="factory-button-cta inline-flex h-10 min-h-10 cursor-pointer items-center border border-danger-500/60 bg-danger-600 px-3 py-0 text-xs font-medium text-white transition-colors hover:bg-danger-500 disabled:cursor-not-allowed disabled:opacity-50"
                @click="handleDelete"
              >
                {{ isDeleting ? 'Deleting…' : 'Delete' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </template>
  </div>
</template>
