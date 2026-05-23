<script setup lang="ts">
import { FileText, Link2, ClipboardCopy, Check, Plus, Copy, CheckCircle2, XCircle, ToggleLeft, ToggleRight, Trash2, Radio, ChevronDown, X, ExternalLink } from 'lucide-vue-next'
import { getSourceChannelLabel } from '~/utils/status-display'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const localePath = useLocalePath()
const jobId = route.params.id as string
const toast = useToast()

const { job, status: fetchStatus, error, updateJob } = useJob(jobId)

useSeoMeta({
  title: computed(() =>
    job.value ? `Application Form — ${job.value.title} — Factory Careers` : 'Application Form — Factory Careers',
  ),
})

// ─────────────────────────────────────────────
// Application link
// ─────────────────────────────────────────────

const requestUrl = useRequestURL()
const applicationUrl = computed(() => {
  const base = `${requestUrl.protocol}//${requestUrl.host}`
  return `${base}/jobs/${job.value?.slug ?? jobId}/apply`
})

const linkCopied = ref(false)

async function copyApplicationLink() {
  try {
    await navigator.clipboard.writeText(applicationUrl.value)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch {
    // Fallback for non-HTTPS contexts
    toast.info(applicationUrl.value)
  }
}

// ─────────────────────────────────────────────
// Application requirements (resume / cover letter)
// ─────────────────────────────────────────────

const requireResume = ref(false)
const requireCoverLetter = ref(false)
const isSavingRequirements = ref(false)
const requirementsSaved = ref(false)
const requirementsError = ref<string | null>(null)

// Sync with fetched job data
watch(job, (j) => {
  if (j) {
    requireResume.value = j.requireResume ?? false
    requireCoverLetter.value = j.requireCoverLetter ?? false
  }
}, { immediate: true })

async function saveRequirements() {
  isSavingRequirements.value = true
  requirementsError.value = null
  try {
    await updateJob({ requireResume: requireResume.value, requireCoverLetter: requireCoverLetter.value })
    requirementsSaved.value = true
    setTimeout(() => { requirementsSaved.value = false }, 2000)
  } catch (err: any) {
    requirementsError.value = err?.data?.statusMessage ?? 'Failed to save requirements.'
  } finally {
    isSavingRequirements.value = false
  }
}

// ─────────────────────────────────────────────
// Tracking links for this job
// ─────────────────────────────────────────────

const {
  links: trackingLinks,
  fetchStatus: linksStatus,
  createLink,
  deleteLink,
  toggleLink,
} = useTrackingLinks({ jobId })

const { allowed: canManageLinks } = usePermission({ sourceTracking: ['create'] })

const showCreateLinkModal = ref(false)
const isCreatingLink = ref(false)
const newLink = ref({
  name: '',
  channel: 'custom' as string,
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
})

async function handleCreateLink() {
  if (!newLink.value.name.trim()) return
  isCreatingLink.value = true
  try {
    await createLink({
      name: newLink.value.name.trim(),
      channel: newLink.value.channel as any,
      jobId,
      utmSource: newLink.value.utmSource || undefined,
      utmMedium: newLink.value.utmMedium || undefined,
      utmCampaign: newLink.value.utmCampaign || undefined,
    })
    showCreateLinkModal.value = false
    newLink.value = { name: '', channel: 'custom', utmSource: '', utmMedium: '', utmCampaign: '' }
  } catch (err: any) {
    toast.error(err?.data?.statusMessage ?? 'Failed to create link')
  } finally {
    isCreatingLink.value = false
  }
}

const deletingLinkId = ref<string | null>(null)
const showDeleteLinkConfirm = ref(false)

function confirmDeleteLink(id: string) {
  deletingLinkId.value = id
  showDeleteLinkConfirm.value = true
}

async function handleDeleteLink() {
  if (!deletingLinkId.value) return
  try {
    await deleteLink(deletingLinkId.value)
  } catch (err: any) {
    toast.error(err?.data?.statusMessage ?? 'Failed to delete')
  } finally {
    showDeleteLinkConfirm.value = false
    deletingLinkId.value = null
  }
}

function buildTrackingUrl(code: string): string {
  const base = `${requestUrl.protocol}//${requestUrl.host}`
  return `${base}/api/public/track/${encodeURIComponent(code)}`
}

const copiedLinkCode = ref<string | null>(null)
async function copyTrackingUrl(code: string) {
  try {
    await navigator.clipboard.writeText(buildTrackingUrl(code))
    copiedLinkCode.value = code
    setTimeout(() => { copiedLinkCode.value = null }, 2000)
  } catch {
    toast.info(buildTrackingUrl(code))
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <JobSubNavActions :job-id="jobId" />

    <!-- Loading -->
    <div v-if="fetchStatus === 'pending'" class="text-center py-12 text-surface-400">
      Loading…
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="ui-alert ui-alert-danger p-4 text-sm"
    >
      {{ error.statusCode === 404 ? 'Job not found.' : 'Failed to load job.' }}
      <NuxtLink :to="$localePath('/dashboard')" class="underline ml-1">Back to Jobs</NuxtLink>
    </div>

    <template v-else-if="job">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">Application Form</h1>
        <p class="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Configure the application experience for <strong>{{ job.title }}</strong>.
        </p>
      </div>

      <!-- Shareable application link (only when job is open) -->
      <div v-if="job.status === 'open'" class="ui-panel-brand p-5 mb-6">
        <div class="flex items-center gap-2 mb-2">
          <Link2 class="size-4 text-brand-600 dark:text-brand-400" />
          <h2 class="text-sm font-semibold text-brand-700 dark:text-brand-300">Application Link</h2>
        </div>
        <p class="text-xs text-surface-600 dark:text-surface-400 mb-3">
          Share this link with candidates so they can apply to this position.
        </p>
        <div class="flex items-center gap-2">
          <input
            type="text"
            readonly
            :value="applicationUrl"
            class="ui-field flex-1 px-3 py-1.5 text-sm select-all"
          />
          <button
            class="ui-button ui-button-primary px-3 py-1.5 text-sm"
            @click="copyApplicationLink"
          >
            <ClipboardCopy class="size-3.5" />
            {{ linkCopied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>

      <div v-else class="ui-panel-muted p-4 mb-6 text-sm text-surface-500 dark:text-surface-400">
        The application link will be available when this job is published (status: <strong>open</strong>).
      </div>

      <!-- Application Requirements -->
      <div class="ui-panel p-5 mb-6">
        <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1">Application requirements</h2>
        <p class="text-xs text-surface-400 dark:text-surface-500 mb-4">
          Choose what candidates must provide when applying.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            class="ui-selectable-panel relative flex items-center gap-3 p-4 text-left transition-colors"
            :class="requireResume
              ? 'ui-selectable-panel-active'
              : ''"
            :aria-pressed="requireResume"
            @click="requireResume = !requireResume"
          >
            <span
              v-if="requireResume"
              class="ui-pill ui-pill-brand absolute top-3 right-3 size-5 justify-center p-0"
              aria-hidden="true"
            >
              <Check class="size-3" />
            </span>
            <div>
              <span class="block text-sm font-medium text-surface-900 dark:text-surface-100">Require resume/CV</span>
              <span class="text-xs text-surface-500">Candidates must upload a file.</span>
            </div>
          </button>
          <button
            type="button"
            class="ui-selectable-panel relative flex items-center gap-3 p-4 text-left transition-colors"
            :class="requireCoverLetter
              ? 'ui-selectable-panel-active'
              : ''"
            :aria-pressed="requireCoverLetter"
            @click="requireCoverLetter = !requireCoverLetter"
          >
            <span
              v-if="requireCoverLetter"
              class="ui-pill ui-pill-brand absolute top-3 right-3 size-5 justify-center p-0"
              aria-hidden="true"
            >
              <Check class="size-3" />
            </span>
            <div>
              <span class="block text-sm font-medium text-surface-900 dark:text-surface-100">Ask for cover letter</span>
              <span class="text-xs text-surface-500">Candidates can write a cover letter.</span>
            </div>
          </button>
        </div>
        <button
          type="button"
          :disabled="isSavingRequirements"
          class="ui-button ui-button-primary px-4 py-2 text-sm"
          @click="saveRequirements"
        >
          {{ requirementsSaved ? 'Saved!' : isSavingRequirements ? 'Saving…' : 'Save requirements' }}
        </button>
        <p v-if="requirementsError" class="mt-2 text-xs text-danger-600 dark:text-danger-400">
          {{ requirementsError }}
        </p>
      </div>

      <!-- Tracking Links for this Job -->
      <div class="ui-panel p-5 mb-6">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <Radio class="size-4 text-surface-500 dark:text-surface-400" />
            <NuxtLink
              :to="localePath({ path: '/dashboard/source-tracking', query: { jobId } })"
              class="text-sm font-semibold text-surface-700 dark:text-surface-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              Source Tracking Links
            </NuxtLink>
          </div>
          <button
            v-if="canManageLinks"
            class="ui-button ui-button-primary px-3 py-1.5 text-xs"
            @click="showCreateLinkModal = true"
          >
            <Plus class="size-3.5" />
            New Link
          </button>
        </div>
        <p class="text-xs text-surface-400 dark:text-surface-500 mb-4">
          Create unique tracking links for this job to measure where applications come from.
        </p>

        <div v-if="linksStatus === 'pending'" class="ui-empty-state py-6 text-sm">
          Loading…
        </div>

        <div v-else-if="trackingLinks.length === 0" class="ui-empty-state py-6">
          <Radio class="size-5 text-surface-300 dark:text-surface-600 mx-auto mb-2" />
          <p class="text-sm text-surface-400 dark:text-surface-500">No tracking links for this job yet.</p>
          <p class="text-xs text-surface-300 dark:text-surface-600 mt-1">Create one to start tracking where candidates find this position.</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="link in trackingLinks"
            :key="link.id"
            class="ui-list-row flex items-center gap-3 px-4 py-3 group transition-colors"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-0.5">
                <NuxtLink
                  :to="localePath(`/dashboard/source-tracking/${link.id}`)"
                  class="text-sm font-medium text-surface-800 dark:text-surface-200 hover:text-brand-600 dark:hover:text-brand-400 truncate no-underline transition-colors"
                  @click.stop
                >
                  {{ link.name }}
                </NuxtLink>
                <span
                  class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700"
                >
                  {{ getSourceChannelLabel(link.channel) }}
                </span>
                <span
                  class="ui-pill gap-0.5 px-1.5 py-0.5 text-[10px]"
                  :class="link.isActive
                    ? 'ui-pill-success'
                    : ''"
                >
                  <CheckCircle2 v-if="link.isActive" class="size-2.5" />
                  <XCircle v-else class="size-2.5" />
                  {{ link.isActive ? 'Active' : 'Inactive' }}
                </span>
              </div>
              <div class="text-[11px] text-surface-400 dark:text-surface-500 tabular-nums">
                {{ link.clickCount }} clicks · {{ link.applicationCount }} applications
              </div>
            </div>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                class="ui-button ui-button-ghost p-1.5"
                title="Copy tracking URL"
                @click="copyTrackingUrl(link.code)"
              >
                <Copy v-if="copiedLinkCode !== link.code" class="size-3.5" />
                <CheckCircle2 v-else class="size-3.5 text-green-500" />
              </button>
              <button
                v-if="canManageLinks"
                class="ui-button ui-button-ghost p-1.5"
                :title="link.isActive ? 'Deactivate' : 'Activate'"
                @click="toggleLink(link.id, !link.isActive)"
              >
                <ToggleRight v-if="link.isActive" class="size-3.5" />
                <ToggleLeft v-else class="size-3.5" />
              </button>
              <button
                v-if="canManageLinks"
                class="ui-button ui-button-ghost ui-button-ghost-danger p-1.5"
                title="Delete"
                @click="confirmDeleteLink(link.id)"
              >
                <Trash2 class="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Application Form Questions -->
      <div class="ui-panel p-5">
        <div class="flex items-center gap-2 mb-3">
          <FileText class="size-4 text-surface-500 dark:text-surface-400" />
          <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-300">Custom Questions</h2>
        </div>
        <p class="text-xs text-surface-400 dark:text-surface-500 mb-4">
          Customize the questions applicants must answer when applying. All applications include name, email, and phone by default.
        </p>
        <JobQuestions :job-id="jobId" />
      </div>
    </template>

    <!-- ═══════════════════════════════════════ -->
    <!-- Modal: Create tracking link             -->
    <!-- ═══════════════════════════════════════ -->
    <Teleport to="body">
      <div
        v-if="showCreateLinkModal"
        class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50 grid place-items-center p-4"
        @click.self="showCreateLinkModal = false"
      >
        <div class="ui-modal-panel relative w-full max-w-lg">
          <div class="ui-panel-header flex items-center justify-between px-6 py-4">
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Create Tracking Link</h2>
            <button
              class="ui-button ui-button-ghost size-8 p-0"
              @click="showCreateLinkModal = false"
            >
              <X class="size-4" />
            </button>
          </div>
          <form class="px-6 py-5 space-y-4" @submit.prevent="handleCreateLink">
            <div>
              <label for="link-name" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Link Name</label>
              <input
                id="link-name"
                v-model="newLink.name"
                type="text"
                placeholder="e.g. LinkedIn Spring Campaign"
                class="ui-field px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label for="link-channel" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Source Channel</label>
              <select
                id="link-channel"
                v-model="newLink.channel"
                class="ui-field px-4 py-2.5 text-sm"
              >
                <optgroup label="Job Boards">
                  <option v-for="ch in ['linkedin', 'indeed', 'glassdoor', 'ziprecruiter', 'monster', 'handshake', 'angellist', 'wellfound', 'dice', 'stackoverflow', 'weworkremotely', 'remoteok', 'builtin', 'hired', 'google_jobs']" :key="ch" :value="ch">{{ getSourceChannelLabel(ch) }}</option>
                </optgroup>
                <optgroup label="Social Media">
                  <option v-for="ch in ['facebook', 'twitter', 'instagram', 'tiktok', 'reddit']" :key="ch" :value="ch">{{ getSourceChannelLabel(ch) }}</option>
                </optgroup>
                <optgroup label="Other">
                  <option v-for="ch in ['referral', 'career_site', 'email', 'event', 'agency', 'direct', 'custom', 'other']" :key="ch" :value="ch">{{ getSourceChannelLabel(ch) }}</option>
                </optgroup>
              </select>
            </div>
            <details class="group">
              <summary class="ui-disclosure-trigger -ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium cursor-pointer select-none">
                <ChevronDown class="size-4 transition-transform group-open:rotate-180" />
                UTM Parameters (optional)
              </summary>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label for="utm-source" class="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">utm_source</label>
                  <input id="utm-source" v-model="newLink.utmSource" type="text" placeholder="linkedin" class="ui-field px-3 py-2 text-xs" />
                </div>
                <div>
                  <label for="utm-medium" class="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">utm_medium</label>
                  <input id="utm-medium" v-model="newLink.utmMedium" type="text" placeholder="social" class="ui-field px-3 py-2 text-xs" />
                </div>
                <div class="col-span-2">
                  <label for="utm-campaign" class="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">utm_campaign</label>
                  <input id="utm-campaign" v-model="newLink.utmCampaign" type="text" placeholder="spring-hiring-2026" class="ui-field px-3 py-2 text-xs" />
                </div>
              </div>
            </details>
            <div class="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                class="ui-button ui-button-secondary px-4 py-2.5 text-sm"
                @click="showCreateLinkModal = false"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="!newLink.name.trim() || isCreatingLink"
                class="ui-button ui-button-primary px-5 py-2.5"
              >
                {{ isCreatingLink ? 'Creating…' : 'Create Link' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- ═══════════════════════════════════════ -->
    <!-- Modal: Delete tracking link confirmation -->
    <!-- ═══════════════════════════════════════ -->
    <Teleport to="body">
      <div
        v-if="showDeleteLinkConfirm"
        class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50 grid place-items-center p-4"
        @click.self="showDeleteLinkConfirm = false"
      >
        <div class="ui-modal-panel relative w-full max-w-sm p-6 text-center">
          <div class="ui-icon-state ui-icon-state-danger mx-auto mb-4 size-12">
            <Trash2 class="size-5" />
          </div>
          <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-2">Delete Tracking Link?</h3>
          <p class="text-sm text-surface-500 dark:text-surface-400 mb-6">
            Existing attribution data will be preserved, but new clicks won't be tracked.
          </p>
          <div class="flex items-center justify-center gap-3">
            <button
              class="ui-button ui-button-secondary px-4 py-2.5 text-sm"
              @click="showDeleteLinkConfirm = false"
            >
              Cancel
            </button>
            <button
              class="ui-button ui-button-danger px-5 py-2.5"
              @click="handleDeleteLink"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
