<script setup lang="ts">
import {
  Save, Trash2, ArrowLeft, ExternalLink, Link2, ClipboardCopy,
} from 'lucide-vue-next'
import { z } from 'zod'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const localePath = useLocalePath()
const jobId = route.params.id as string
const toast = useToast()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const { track } = useTrack()

const { job, status: fetchStatus, error: fetchError, updateJob, deleteJob } = useJob(jobId)

useSeoMeta({
  title: computed(() =>
    job.value ? `Settings — ${job.value.title} — Factory Careers` : 'Job Settings — Factory Careers',
  ),
})

// ─────────────────────────────────────────────
// Form state — synced from fetched job
// ─────────────────────────────────────────────

const form = ref({
  title: '',
  description: '',
  location: '',
  type: 'full_time' as string,
  slug: '',
  salaryMin: null as number | null,
  salaryMax: null as number | null,
  salaryCurrency: '',
  salaryUnit: '' as string,
  salaryNegotiable: false,
  remoteStatus: '' as string,
  experienceLevel: '' as string,
  validThrough: '',
  requireResume: false,
  requireCoverLetter: false,
  autoScoreOnApply: false,
})

watch(job, (j) => {
  if (j) {
    form.value = {
      title: j.title ?? '',
      description: j.description ?? '',
      location: j.location ?? '',
      type: j.type ?? 'full_time',
      slug: j.slug ?? '',
      salaryMin: j.salaryMin ?? null,
      salaryMax: j.salaryMax ?? null,
      salaryCurrency: j.salaryCurrency ?? '',
      salaryUnit: j.salaryUnit ?? '',
      salaryNegotiable: j.salaryNegotiable ?? false,
      remoteStatus: j.remoteStatus ?? '',
      experienceLevel: j.experienceLevel ?? '',
      validThrough: j.validThrough ? new Date(j.validThrough).toISOString().split('T')[0] ?? '' : '',
      requireResume: j.requireResume ?? false,
      requireCoverLetter: j.requireCoverLetter ?? false,
      autoScoreOnApply: j.autoScoreOnApply ?? false,
    }
  }
}, { immediate: true })

// When "Negotiable" is toggled on, clear the salary range fields
watch(() => form.value.salaryNegotiable, (negotiable) => {
  if (negotiable) {
    form.value.salaryMin = null
    form.value.salaryMax = null
    form.value.salaryCurrency = ''
    form.value.salaryUnit = ''
  }
})

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

const editSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().optional(),
  location: z.string().optional(),
  type: z.enum(['full_time', 'part_time', 'contract', 'internship']),
  slug: z.string().max(80).optional(),
  salaryMin: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  salaryMax: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  salaryCurrency: z.string().length(3).optional().or(z.literal('')),
  salaryUnit: z.enum(['YEAR', 'MONTH', 'HOUR']).optional().or(z.literal('')),
  salaryNegotiable: z.boolean().optional(),
  remoteStatus: z.enum(['remote', 'hybrid', 'onsite']).optional().or(z.literal('')),
  experienceLevel: z.enum(['junior', 'mid', 'senior', 'lead']).optional().or(z.literal('')),
  validThrough: z.string().optional(),
  requireResume: z.boolean().optional(),
  requireCoverLetter: z.boolean().optional(),
  autoScoreOnApply: z.boolean().optional(),
})

const errors = ref<Record<string, string>>({})
const isSaving = ref(false)
const saved = ref(false)

async function handleSave() {
  const result = editSchema.safeParse(form.value)
  if (!result.success) {
    errors.value = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0]?.toString()
      if (field) errors.value[field] = issue.message
    }
    return
  }
  errors.value = {}
  isSaving.value = true

  try {
    const payload: Record<string, unknown> = {
      title: form.value.title,
      description: form.value.description || null,
      location: form.value.location || null,
      type: form.value.type,
      slug: form.value.slug || undefined,
      requireResume: form.value.requireResume,
      requireCoverLetter: form.value.requireCoverLetter,
      autoScoreOnApply: form.value.autoScoreOnApply,
      salaryNegotiable: form.value.salaryNegotiable,
      // Always send salary fields so cleared values write null to the DB
      salaryMin: form.value.salaryNegotiable ? null : (form.value.salaryMin ?? null),
      salaryMax: form.value.salaryNegotiable ? null : (form.value.salaryMax ?? null),
      salaryCurrency: form.value.salaryNegotiable ? null : (form.value.salaryCurrency || null),
      salaryUnit: form.value.salaryNegotiable ? null : (form.value.salaryUnit || null),
      remoteStatus: form.value.remoteStatus || null,
      experienceLevel: (form.value.experienceLevel as 'junior' | 'mid' | 'senior' | 'lead' | null) || null,
      // Send null when cleared so the DB column is set to NULL
      validThrough: form.value.validThrough ? new Date(form.value.validThrough) : null,
    }

    await updateJob(payload as any)
    track('job_settings_saved', { job_id: jobId })
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to save changes', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isSaving.value = false
  }
}

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
    toast.info(applicationUrl.value)
  }
}

// ─────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────

const showDeleteConfirm = ref(false)
const isDeleting = ref(false)

async function handleDelete() {
  isDeleting.value = true
  try {
    track('job_deleted', { job_id: jobId, source: 'settings' })
    await deleteJob()
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to delete job', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
    isDeleting.value = false
    showDeleteConfirm.value = false
  }
}

// ─────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────

const typeOptions = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
]

const remoteOptions = [
  { value: '', label: 'Not specified' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
]

const experienceLevelOptions = [
  { value: '', label: 'Not specified' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
]

const salaryUnitOptions = [
  { value: '', label: 'Not specified' },
  { value: 'YEAR', label: 'Per year' },
  { value: 'MONTH', label: 'Per month' },
  { value: 'HOUR', label: 'Per hour' },
]

function onSalaryMinChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.value) form.value.salaryMin = null
}

function onSalaryMaxChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.value) form.value.salaryMax = null
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
      v-else-if="fetchError"
      class="ui-alert ui-alert-danger"
    >
      {{ fetchError.statusCode === 404 ? 'Job not found.' : 'Failed to load job.' }}
      <NuxtLink :to="$localePath('/dashboard/jobs')" class="ui-inline-link ui-inline-link-brand ml-1">
        Back to Jobs
      </NuxtLink>
    </div>

    <template v-else-if="job">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">Job Settings</h1>
        <p class="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Edit the details for <strong>{{ job.title }}</strong>.
        </p>
      </div>

      <form @submit.prevent="handleSave" class="space-y-8">
        <!-- ═══════════════════════════════════════ -->
        <!-- SECTION: Basic Details                   -->
        <!-- ═══════════════════════════════════════ -->
        <section class="ui-panel p-6">
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-5">Basic Details</h2>
          <div class="space-y-4">
            <!-- Title -->
            <div>
              <label for="settings-title" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Title <span class="ui-required-marker">*</span>
              </label>
              <input
                id="settings-title"
                v-model="form.title"
                type="text"
                class="ui-field"
                :class="errors.title ? 'ui-field-invalid' : ''"
              />
              <p v-if="errors.title" class="ui-feedback-danger mt-1 text-xs">{{ errors.title }}</p>
            </div>

            <!-- Description -->
            <div>
              <label for="settings-description" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Description
              </label>
              <textarea
                id="settings-description"
                v-model="form.description"
                rows="6"
                placeholder="Describe the role, responsibilities, and requirements…"
                class="ui-field"
              />
            </div>

            <!-- Location + Type row -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="settings-location" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Location
                </label>
                <input
                  id="settings-location"
                  v-model="form.location"
                  type="text"
                  placeholder="e.g. Oslo, Norway"
                  class="ui-field"
                />
              </div>
              <div>
                <label for="settings-type" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Employment Type
                </label>
                <select
                  id="settings-type"
                  v-model="form.type"
                  class="ui-field"
                >
                  <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Remote status -->
            <div>
              <label for="settings-remote" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Work Arrangement
              </label>
              <select
                id="settings-remote"
                v-model="form.remoteStatus"
                class="ui-field"
              >
                <option v-for="opt in remoteOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- Experience Level -->
            <div>
              <label for="settings-experience-level" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Experience Level
              </label>
              <select
                id="settings-experience-level"
                v-model="form.experienceLevel"
                class="ui-field"
              >
                <option v-for="opt in experienceLevelOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- Slug -->
            <div>
              <label for="settings-slug" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                URL Slug
              </label>
              <input
                id="settings-slug"
                v-model="form.slug"
                type="text"
                placeholder="auto-generated-from-title"
                class="ui-field font-mono text-xs"
              />
              <p class="mt-1 text-xs text-surface-400 dark:text-surface-500">
                Used in the public application URL. Leave blank to auto-generate from title.
              </p>
            </div>
          </div>
        </section>

        <!-- ═══════════════════════════════════════ -->
        <!-- SECTION: Salary & Compensation           -->
        <!-- ═══════════════════════════════════════ -->
        <section class="ui-panel p-6">
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-1">Salary & Compensation</h2>
          <p class="text-xs text-surface-400 dark:text-surface-500 mb-5">
            Adding salary information improves visibility on Google Jobs.
          </p>
          <div class="space-y-4">
            <!-- Negotiable toggle -->
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                v-model="form.salaryNegotiable"
                type="checkbox"
                class="ui-checkbox ui-checkbox-brand size-4"
              />
              <div>
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Salary is negotiable</span>
                <p class="text-xs text-surface-400 dark:text-surface-500">
                  When checked, "Negotiable" is shown instead of a specific salary range. Salary fields below will be cleared.
                </p>
              </div>
            </label>

            <!-- Salary range fields — hidden when negotiable -->
            <template v-if="!form.salaryNegotiable">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="settings-salary-min" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Minimum Salary
                  </label>
                  <input
                    id="settings-salary-min"
                    v-model.number="form.salaryMin"
                    type="number"
                    min="0"
                    placeholder="e.g. 50000"
                    class="ui-field"
                    @change="onSalaryMinChange"
                  />
                </div>
                <div>
                  <label for="settings-salary-max" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Maximum Salary
                  </label>
                  <input
                    id="settings-salary-max"
                    v-model.number="form.salaryMax"
                    type="number"
                    min="0"
                    placeholder="e.g. 80000"
                    class="ui-field"
                    @change="onSalaryMaxChange"
                  />
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="settings-currency" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Currency
                  </label>
                  <input
                    id="settings-currency"
                    v-model="form.salaryCurrency"
                    type="text"
                    maxlength="3"
                    placeholder="e.g. USD, EUR, NOK"
                    class="ui-field uppercase"
                  />
                </div>
                <div>
                  <label for="settings-salary-unit" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Pay Period
                  </label>
                  <select
                    id="settings-salary-unit"
                    v-model="form.salaryUnit"
                    class="ui-field"
                  >
                    <option v-for="opt in salaryUnitOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </div>
              </div>
            </template>
          </div>
        </section>

        <!-- ═══════════════════════════════════════ -->
        <!-- SECTION: Application Options             -->
        <!-- ═══════════════════════════════════════ -->
        <section class="ui-panel p-6">
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-1">Application Options</h2>
          <p class="text-xs text-surface-400 dark:text-surface-500 mb-5">
            Control what candidates must provide when applying.
          </p>
          <div class="space-y-3">
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                v-model="form.requireResume"
                type="checkbox"
                class="ui-checkbox ui-checkbox-brand size-4"
              />
              <div>
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Require resume/CV</span>
                <p class="text-xs text-surface-400 dark:text-surface-500">Candidates must upload a resume file.</p>
              </div>
            </label>
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                v-model="form.requireCoverLetter"
                type="checkbox"
                class="ui-checkbox ui-checkbox-brand size-4"
              />
              <div>
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Ask for cover letter</span>
                <p class="text-xs text-surface-400 dark:text-surface-500">Candidates can write a cover letter.</p>
              </div>
            </label>
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                v-model="form.autoScoreOnApply"
                type="checkbox"
                class="ui-checkbox ui-checkbox-brand size-4"
              />
              <div>
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Auto-score on apply</span>
                <p class="text-xs text-surface-400 dark:text-surface-500">Automatically run AI scoring when a candidate applies.</p>
              </div>
            </label>
          </div>
        </section>

        <!-- ═══════════════════════════════════════ -->
        <!-- SECTION: Listing Expiry                  -->
        <!-- ═══════════════════════════════════════ -->
        <section class="ui-panel p-6">
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-1">Listing Expiry</h2>
          <p class="text-xs text-surface-400 dark:text-surface-500 mb-5">
            Set when this job posting automatically expires. Required for Google Jobs rich results.
          </p>
          <div>
            <label for="settings-valid-through" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
              Valid Through
            </label>
            <div class="flex items-center gap-2">
              <input
                id="settings-valid-through"
                v-model="form.validThrough"
                type="date"
                class="ui-field sm:w-64"
              />
              <button
                v-if="form.validThrough"
                type="button"
                class="ui-button ui-button-ghost ui-button-ghost-danger shrink-0 px-2 py-1 text-xs"
                @click="form.validThrough = ''"
              >
                Clear
              </button>
            </div>
            <p class="mt-1.5 text-xs text-surface-400 dark:text-surface-500">Leave blank if there is no fixed expiry date.</p>
          </div>
        </section>

        <!-- ═══════════════════════════════════════ -->
        <!-- SECTION: Application Link                -->
        <!-- ═══════════════════════════════════════ -->
        <section v-if="job.status === 'open'" class="ui-panel-brand p-6">
          <div class="flex items-center gap-2 mb-2">
            <Link2 class="ui-icon-brand size-4" />
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Application Link</h2>
          </div>
          <p class="text-xs text-surface-600 dark:text-surface-400 mb-3">
            Share this link with candidates so they can apply to this position.
          </p>
          <div class="flex items-center gap-2">
            <input
              type="text"
              readonly
              :value="applicationUrl"
              class="ui-field min-w-0 flex-1 px-3 py-1.5 text-sm select-all"
            />
            <button
              type="button"
              class="ui-button ui-button-primary gap-1.5 px-3 py-1.5 text-sm"
              @click="copyApplicationLink"
            >
              <ClipboardCopy class="size-3.5" />
              {{ linkCopied ? 'Copied!' : 'Copy' }}
            </button>
          </div>
        </section>

        <!-- ═══════════════════════════════════════ -->
        <!-- Save button                              -->
        <!-- ═══════════════════════════════════════ -->
        <div class="flex items-center justify-between pt-2 pb-8">
          <button
            type="submit"
            :disabled="isSaving"
            class="ui-button ui-button-primary cursor-pointer gap-2 px-5 py-2.5 text-sm font-semibold"
          >
            <Save class="size-4" />
            {{ saved ? 'Saved!' : isSaving ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
      </form>

      <!-- ═══════════════════════════════════════ -->
      <!-- DANGER ZONE                              -->
      <!-- ═══════════════════════════════════════ -->
      <section class="ui-panel-danger p-6 mb-12">
        <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-1">Danger Zone</h2>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
          Permanently delete this job and all associated applications.
        </p>

        <div v-if="!showDeleteConfirm">
          <button
            type="button"
            class="ui-button ui-button-danger-outline cursor-pointer gap-2 px-4 py-2 text-sm"
            @click="showDeleteConfirm = true"
          >
            <Trash2 class="size-4" />
            Delete this Job
          </button>
        </div>

        <div v-else class="ui-panel-muted p-4">
          <p class="text-sm text-surface-700 dark:text-surface-300 mb-3">
            Are you sure you want to delete <strong>{{ job.title }}</strong>? This will also delete all associated applications. This action cannot be undone.
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              :disabled="isDeleting"
              class="ui-button ui-button-danger cursor-pointer gap-1.5 px-4 py-2 text-sm"
              @click="handleDelete"
            >
              {{ isDeleting ? 'Deleting…' : 'Yes, Delete' }}
            </button>
            <button
              type="button"
              :disabled="isDeleting"
              class="ui-button ui-button-secondary cursor-pointer gap-1.5 px-4 py-2 text-sm"
              @click="showDeleteConfirm = false"
            >
              Cancel
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
