<script setup lang="ts">
import { X, ExternalLink, Mail, Phone, Calendar, Clock, Briefcase, FileText, Plus, Download, Eye } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import { getApplicationStatusBadgeClass } from '~/utils/status-display'

const props = defineProps<{
  candidateId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const localePath = useLocalePath()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()

const { candidate, status: fetchStatus, error, refresh } = useCandidate(() => props.candidateId)
const { formatCandidateName, formatDate } = useOrgSettings()

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

function openScheduleInterview(app: { id: string; job: { title: string } }) {
  interviewTargetApp.value = { id: app.id, jobTitle: app.job.title }
  showInterviewSidebar.value = true
}

// ─── Documents ────────────────────────────────────────────────────────────────

const { downloadDocument, getPreviewUrl } = useDocuments()

// Preview state
const showPreview = ref(false)
const previewUrl = ref<string | null>(null)
const previewFilename = ref('')
const previewMimeType = ref('')
const previewDocId = ref<string | null>(null)

const isPdfPreview = computed(() => previewMimeType.value === 'application/pdf')

async function handlePreview(docId: string, mimeType?: string) {
  if (mimeType && mimeType !== 'application/pdf') {
    await handleDownload(docId)
    return
  }
  showPreview.value = true
  previewDocId.value = docId
  const doc = candidate.value?.documents?.find((d: any) => d.id === docId)
  previewFilename.value = doc?.originalFilename ?? 'Document'
  previewMimeType.value = doc?.mimeType ?? 'application/pdf'
  previewUrl.value = getPreviewUrl(docId)
}

function closePreview() {
  showPreview.value = false
  previewUrl.value = null
  previewFilename.value = ''
  previewMimeType.value = ''
  previewDocId.value = null
}

async function handleDownload(docId: string) {
  try {
    await downloadDocument(docId)
  } catch {
    toast.error('Failed to download document')
  }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

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
            <!-- Header -->
            <div class="border border-white/12 bg-white/[0.025] p-5">
              <p class="mb-2 text-xs font-medium uppercase tracking-wide text-white/38">
                Candidate profile
              </p>
              <h2 class="mb-1 truncate text-2xl font-bold text-white">
                {{ formatCandidateName(candidate) }}
              </h2>
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

            <!-- Contact details -->
            <div class="border border-white/12 bg-white/[0.025] p-5">
              <h3 class="mb-3 text-sm font-semibold text-white">Details</h3>
              <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                  <dd class="font-medium text-white/82">{{ candidate.phone || '—' }}</dd>
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
                  <dd class="font-medium text-white/82">{{ candidate.displayName }}</dd>
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

            <!-- Properties -->
            <div class="border border-white/12 bg-white/[0.025] p-4">
              <h3 class="mb-2 px-2 text-sm font-semibold text-white">Properties</h3>
              <PropertyBlock
                entity-type="candidate"
                :entity-id="candidateId"
                :entries="(candidate.properties ?? []) as import('~~/shared/properties').PropertyEntry[]"
                @refresh="refresh()"
              />
            </div>

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
            <div v-if="activeTab === 'applications'">
              <div class="flex justify-end mb-3">
                <button
                  class="factory-toolbar-button inline-flex h-10 min-h-10 items-center gap-1.5 border px-3 py-0 text-xs font-medium transition-colors"
                  @click="showApplyModal = true"
                >
                  <Plus class="size-3.5" />
                  Apply to Job
                </button>
              </div>

              <div
                v-if="!candidate.applications?.length"
                class="border border-white/12 bg-white/[0.025] p-8 text-center"
              >
                <Briefcase class="mx-auto mb-2 size-8 text-white/32" />
                <p class="text-sm text-white/54">No applications yet.</p>
              </div>

              <div v-else class="space-y-2">
                <div
                  v-for="app in candidate.applications"
                  :key="app.id"
                  class="group flex flex-col gap-2 border border-white/12 bg-white/[0.025] px-4 py-3 transition-all hover:border-brand-500/70 hover:bg-brand-500/10 sm:flex-row sm:items-center sm:justify-between"
                >
                  <NuxtLink
                    :to="localePath(`/dashboard/applications/${app.id}`)"
                    class="min-w-0 flex-1 block"
                  >
                    <h4 class="truncate text-sm font-semibold text-white transition-colors group-hover:text-brand-400">
                      {{ app.job.title }}
                    </h4>
                    <ApplicationTimestampStack
                      :applied-at="app.createdAt"
                      class="mt-1 items-start sm:items-start"
                    />
                  </NuxtLink>
                  <div class="flex items-center gap-2 shrink-0 sm:ml-3">
                    <button
                      class="factory-toolbar-button inline-flex h-8 min-h-8 items-center gap-1 border px-2.5 py-0 text-[10px] font-medium transition-colors"
                      title="Schedule Interview"
                      @click="openScheduleInterview(app)"
                    >
                      <Calendar class="size-3" />
                      Schedule
                    </button>
                    <span
                      class="inline-flex h-8 min-h-8 shrink-0 items-center border px-2.5 py-0 text-[10px] font-semibold uppercase"
                      :class="getApplicationStatusBadgeClass(app.status, 'factory')"
                    >
                      {{ app.status }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Documents tab -->
            <div v-if="activeTab === 'documents'">
              <!-- Inline PDF preview -->
              <template v-if="showPreview">
                <div class="flex items-center justify-between mb-3">
                  <button
                    class="factory-toolbar-button inline-flex h-10 min-h-10 items-center gap-1.5 border px-3 py-0 text-xs font-medium transition-colors hover:bg-white hover:text-black"
                    @click="closePreview"
                  >
                    ← Back to documents
                  </button>
                  <div class="flex items-center gap-1">
                    <button
                      v-if="previewDocId"
                      class="factory-toolbar-button p-1.5 text-white/58 hover:text-white transition-colors"
                      title="Download"
                      @click="handleDownload(previewDocId!)"
                    >
                      <Download class="size-4" />
                    </button>
                  </div>
                </div>

                <div v-if="previewFilename" class="flex items-center gap-2 mb-3">
                  <FileText class="size-4 shrink-0 text-white/42" />
                  <span class="truncate text-sm font-medium text-white/78">
                    {{ previewFilename }}
                  </span>
                </div>

                <iframe
                  v-if="previewUrl && isPdfPreview"
                  :src="previewUrl"
                  class="w-full border border-white/12"
                  style="height: 60vh;"
                  title="Document preview"
                />
              </template>

              <!-- Document list -->
              <template v-else>
                <div
                  v-if="!candidate.documents?.length"
                  class="border border-white/12 bg-white/[0.025] p-8 text-center"
                >
                  <FileText class="mx-auto mb-2 size-8 text-white/32" />
                  <p class="text-sm text-white/54">No documents yet.</p>
                </div>

                <div v-else class="space-y-2">
                  <div
                    v-for="doc in candidate.documents"
                    :key="doc.id"
                    class="group flex items-center justify-between border border-white/12 bg-white/[0.025] px-4 py-3 transition-colors"
                    :class="doc.mimeType === 'application/pdf' ? 'cursor-pointer hover:border-brand-500/70 hover:bg-brand-500/10' : ''"
                    @click="doc.mimeType === 'application/pdf' ? handlePreview(doc.id, doc.mimeType) : undefined"
                  >
                    <div class="flex items-center gap-3 min-w-0">
                      <FileText class="size-4 shrink-0" :class="doc.mimeType === 'application/pdf' ? 'text-danger-400' : 'text-white/42'" />
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
                    <div class="flex items-center gap-1 shrink-0" @click.stop>
                      <button
                        v-if="doc.mimeType === 'application/pdf'"
                        class="factory-toolbar-button p-1.5 text-white/58 hover:text-white transition-colors"
                        title="Preview PDF"
                        @click="handlePreview(doc.id, doc.mimeType)"
                      >
                        <Eye class="size-4" />
                      </button>
                      <button
                        class="factory-toolbar-button p-1.5 text-white/58 hover:text-white transition-colors"
                        title="Download"
                        @click="handleDownload(doc.id)"
                      >
                        <Download class="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </div>
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
