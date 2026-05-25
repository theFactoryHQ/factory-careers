<script setup lang="ts">
import { FileText, Link2, Check, Plus, Copy, CheckCircle2, XCircle, ToggleLeft, ToggleRight, Trash2, Radio, ChevronDown, X, Eye, Save, ShieldCheck } from 'lucide-vue-next'
import { z } from 'zod'
import { getSourceChannelLabel } from '~/utils/status-display'
import { CURRENCY_OPTIONS, CURRENCY_VALUES } from '~~/shared/currency-options'
import { todayDateInputValue, toDateInputValue } from '~~/shared/date-input'
import { SALARY_UNIT_OPTIONS, SALARY_UNIT_VALUES } from '~~/shared/salary-options'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const localePath = useLocalePath()
const jobId = route.params.id as string
const toast = useToast()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()

const { job, status: fetchStatus, error, updateJob } = useJob(jobId)
const { defaultSalaryUnit } = useOrgSettings()
const { questions: previewQuestions } = useJobQuestions(jobId)
const showApplicationPreview = ref(false)

const previewQuestionTypeLabels: Record<string, string> = {
  short_text: 'Short answer',
  long_text: 'Long answer',
  single_select: 'Single select',
  multi_select: 'Multiple select',
  number: 'Number',
  date: 'Date',
  url: 'URL',
  checkbox: 'Checkbox',
  file_upload: 'File upload',
}

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

// ─────────────────────────────────────────────
// Applicant-facing posting details
// ─────────────────────────────────────────────

const form = ref({
  title: '',
  description: '',
  location: '',
  type: 'full_time' as string,
  slug: '',
  salaryMin: null as number | null,
  salaryMax: null as number | null,
  salaryCurrency: 'USD',
  salaryUnit: 'YEAR',
  salaryNegotiable: false,
  remoteStatus: '' as string,
  experienceLevel: '' as string,
  activeFrom: todayDateInputValue(),
  validThrough: '',
})

watch([job, defaultSalaryUnit], ([j]) => {
  if (!j) return
  form.value = {
    title: j.title ?? '',
    description: j.description ?? '',
    location: j.location ?? '',
    type: j.type ?? 'full_time',
    slug: j.slug ?? '',
    salaryMin: j.salaryMin ?? null,
    salaryMax: j.salaryMax ?? null,
    salaryCurrency: j.salaryCurrency ?? 'USD',
    salaryUnit: j.salaryUnit ?? defaultSalaryUnit.value,
    salaryNegotiable: j.salaryNegotiable ?? false,
    remoteStatus: j.remoteStatus ?? '',
    experienceLevel: j.experienceLevel ?? '',
    activeFrom: j.activeFrom ? toDateInputValue(j.activeFrom) : todayDateInputValue(),
    validThrough: j.validThrough ? toDateInputValue(j.validThrough) : '',
  }
}, { immediate: true })

watch(() => form.value.salaryNegotiable, (negotiable) => {
  if (negotiable) {
    form.value.salaryMin = null
    form.value.salaryMax = null
    form.value.salaryCurrency = ''
    form.value.salaryUnit = ''
  } else if (!form.value.salaryCurrency) {
    form.value.salaryCurrency = 'USD'
    form.value.salaryUnit = defaultSalaryUnit.value
  } else if (!form.value.salaryUnit) {
    form.value.salaryUnit = defaultSalaryUnit.value
  }
})

const postingSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().optional(),
  location: z.string().optional(),
  type: z.enum(['full_time', 'part_time', 'contract', 'internship']),
  slug: z.string().max(80).optional(),
  salaryMin: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  salaryMax: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  salaryCurrency: z.enum(CURRENCY_VALUES).optional().or(z.literal('')),
  salaryUnit: z.enum(SALARY_UNIT_VALUES).optional().or(z.literal('')),
  salaryNegotiable: z.boolean().optional(),
  remoteStatus: z.enum(['remote', 'hybrid', 'onsite']).optional().or(z.literal('')),
  experienceLevel: z.enum(['junior', 'mid', 'senior', 'lead']).optional().or(z.literal('')),
  activeFrom: z.string().optional(),
  validThrough: z.string().optional(),
})

const postingErrors = ref<Record<string, string>>({})
const isSavingPosting = ref(false)

async function savePostingDetails() {
  const result = postingSchema.safeParse(form.value)
  if (!result.success) {
    postingErrors.value = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0]?.toString()
      if (field) postingErrors.value[field] = issue.message
    }
    return
  }

  postingErrors.value = {}
  isSavingPosting.value = true
  try {
    await updateJob({
      title: form.value.title,
      description: form.value.description || null,
      location: form.value.location || null,
      type: form.value.type,
      slug: form.value.slug || undefined,
      salaryNegotiable: form.value.salaryNegotiable,
      salaryMin: form.value.salaryNegotiable ? null : (form.value.salaryMin ?? null),
      salaryMax: form.value.salaryNegotiable ? null : (form.value.salaryMax ?? null),
      salaryCurrency: form.value.salaryNegotiable ? null : (form.value.salaryCurrency || 'USD'),
      salaryUnit: form.value.salaryNegotiable ? null : (form.value.salaryUnit || defaultSalaryUnit.value),
      remoteStatus: form.value.remoteStatus || null,
      experienceLevel: (form.value.experienceLevel as 'junior' | 'mid' | 'senior' | 'lead' | null) || null,
      activeFrom: form.value.activeFrom ? new Date(form.value.activeFrom) : new Date(todayDateInputValue()),
      validThrough: form.value.validThrough ? new Date(form.value.validThrough) : null,
    } as any)
    toast.success('Application details saved')
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to save application details', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isSavingPosting.value = false
  }
}

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

function onSalaryMinChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.value) form.value.salaryMin = null
}

function onSalaryMaxChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.value) form.value.salaryMax = null
}

// ─────────────────────────────────────────────
// Application requirements (resume / cover letter)
// ─────────────────────────────────────────────

const requireResume = ref(false)
const requireCoverLetter = ref(false)
const isSavingRequirements = ref(false)
const requirementsError = ref<string | null>(null)
const applicationComplianceEnabled = ref(true)
const includeEeo = ref(true)
const includeVeteran = ref(true)
const includeDisability = ref(true)
const isSavingCompliance = ref(false)
const complianceError = ref<string | null>(null)
const previewComplianceEnabled = computed(() =>
  applicationComplianceEnabled.value && (includeEeo.value || includeVeteran.value || includeDisability.value),
)

// Sync with fetched job data
watch(job, (j) => {
  if (j) {
    requireResume.value = j.requireResume ?? false
    requireCoverLetter.value = j.requireCoverLetter ?? false
    applicationComplianceEnabled.value = j.applicationComplianceEnabled ?? true
    includeEeo.value = j.includeEeo ?? true
    includeVeteran.value = j.includeVeteran ?? true
    includeDisability.value = j.includeDisability ?? true
  }
}, { immediate: true })

async function saveRequirements() {
  isSavingRequirements.value = true
  requirementsError.value = null
  try {
    await updateJob({ requireResume: requireResume.value, requireCoverLetter: requireCoverLetter.value })
    toast.success('Application requirements saved')
  } catch (err: any) {
    requirementsError.value = err?.data?.statusMessage ?? 'Failed to save requirements.'
  } finally {
    isSavingRequirements.value = false
  }
}

async function saveComplianceQuestions() {
  isSavingCompliance.value = true
  complianceError.value = null
  try {
    await updateJob({
      applicationComplianceEnabled: applicationComplianceEnabled.value,
      includeEeo: includeEeo.value,
      includeVeteran: includeVeteran.value,
      includeDisability: includeDisability.value,
    })
    toast.success('Compliance questions saved')
  } catch (err: any) {
    complianceError.value = err?.data?.statusMessage ?? 'Failed to save compliance questions.'
  } finally {
    isSavingCompliance.value = false
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
    <div v-if="fetchStatus === 'pending' && !job" class="text-center py-12 text-surface-400">
      Loading…
    </div>

    <template v-if="job">
      <!-- Header -->
      <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">Application Form</h1>
          <p class="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Configure the application experience for <strong>{{ job.title }}</strong>.
          </p>
        </div>
        <button
          type="button"
          class="ui-button ui-button-secondary h-10 shrink-0 px-4 text-sm"
          @click="showApplicationPreview = true"
        >
          <Eye class="size-4" />
          Preview form
        </button>
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
        <CopyField
          :value="applicationUrl"
          label="application link"
          title="Copy application link"
          tone="brand"
        />
      </div>

      <div v-else class="ui-panel-muted p-4 mb-6 text-sm text-surface-500 dark:text-surface-400">
        The application link will be available when this job is published (status: <strong>open</strong>).
      </div>

      <form class="space-y-6" @submit.prevent="savePostingDetails">
        <!-- Basic Details -->
        <section class="ui-panel p-5">
          <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-4">Basic Details</h2>
          <div class="space-y-4">
            <div>
              <label for="application-title" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Title <span class="text-danger-500">*</span>
              </label>
              <input
                id="application-title"
                v-model="form.title"
                type="text"
                class="ui-field px-3 py-2 text-sm"
              />
              <p v-if="postingErrors.title" class="mt-1 text-xs text-danger-600 dark:text-danger-400">{{ postingErrors.title }}</p>
            </div>

            <div>
              <label for="application-description" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Description
              </label>
              <textarea
                id="application-description"
                v-model="form.description"
                rows="6"
                placeholder="Describe the role, responsibilities, and requirements..."
                class="ui-field px-3 py-2 text-sm"
              ></textarea>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label for="application-location" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Location
                </label>
                <input
                  id="application-location"
                  v-model="form.location"
                  type="text"
                  placeholder="e.g. Remote / United States"
                  class="ui-field px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label for="application-type" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Employment Type
                </label>
                <FactorySelect
                  id="application-type"
                  v-model="form.type"
                  :options="typeOptions"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label for="application-remote" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Work Arrangement
                </label>
                <FactorySelect
                  id="application-remote"
                  v-model="form.remoteStatus"
                  :options="remoteOptions"
                />
              </div>
              <div>
                <label for="application-experience-level" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Experience Level
                </label>
                <FactorySelect
                  id="application-experience-level"
                  v-model="form.experienceLevel"
                  :options="experienceLevelOptions"
                />
              </div>
            </div>

            <div>
              <label for="application-slug" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                URL Slug
              </label>
              <input
                id="application-slug"
                v-model="form.slug"
                type="text"
                placeholder="auto-generated-from-title"
                class="ui-field px-3 py-2 text-xs font-mono"
              />
              <p class="mt-1 text-xs text-surface-400 dark:text-surface-500">
                Used in the public application URL. Leave blank to auto-generate from title.
              </p>
            </div>
          </div>
        </section>

        <!-- Salary & Compensation -->
        <section class="ui-panel p-5">
          <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1">Salary & Compensation</h2>
          <p class="text-xs text-surface-400 dark:text-surface-500 mb-5">
            Adding salary information improves visibility on Google Jobs.
          </p>
          <div class="space-y-4">
            <label class="flex cursor-pointer items-center gap-3">
              <input
                v-model="form.salaryNegotiable"
                type="checkbox"
                class="size-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 dark:border-surface-600"
              />
              <div>
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Salary is negotiable</span>
                <p class="text-xs text-surface-400 dark:text-surface-500">
                  Show "Negotiable" instead of a specific salary range.
                </p>
              </div>
            </label>

            <template v-if="!form.salaryNegotiable">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label for="application-salary-min" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Minimum Salary
                  </label>
                  <input
                    id="application-salary-min"
                    v-model.number="form.salaryMin"
                    type="number"
                    min="0"
                    placeholder="e.g. 50000"
                    class="ui-field px-3 py-2 text-sm"
                    @change="onSalaryMinChange"
                  />
                </div>
                <div>
                  <label for="application-salary-max" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Maximum Salary
                  </label>
                  <input
                    id="application-salary-max"
                    v-model.number="form.salaryMax"
                    type="number"
                    min="0"
                    placeholder="e.g. 80000"
                    class="ui-field px-3 py-2 text-sm"
                    @change="onSalaryMaxChange"
                  />
                </div>
              </div>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label for="application-currency" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Currency
                  </label>
                  <FactorySelect
                    id="application-currency"
                    v-model="form.salaryCurrency"
                    :options="CURRENCY_OPTIONS"
                  />
                </div>
                <div>
                  <label for="application-salary-unit" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Pay Period
                  </label>
                  <FactorySelect
                    id="application-salary-unit"
                    v-model="form.salaryUnit"
                    :options="SALARY_UNIT_OPTIONS"
                  />
                </div>
              </div>
            </template>
          </div>
        </section>

        <!-- Listing Schedule -->
        <section class="ui-panel p-5">
          <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1">Listing Schedule</h2>
          <p class="text-xs text-surface-400 dark:text-surface-500 mb-5">
            Set when this job posting goes live and when it automatically expires.
          </p>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label for="application-active-from" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Active From
              </label>
              <input
                id="application-active-from"
                v-model="form.activeFrom"
                type="date"
                class="ui-field px-3 py-2 text-sm"
              />
              <p class="mt-1.5 text-xs text-surface-400 dark:text-surface-500">Defaults to today for new jobs.</p>
            </div>
            <div>
              <label for="application-valid-through" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Valid Through
              </label>
              <div class="flex items-center gap-2">
                <input
                  id="application-valid-through"
                  v-model="form.validThrough"
                  type="date"
                  class="ui-field px-3 py-2 text-sm"
                />
                <button
                  v-if="form.validThrough"
                  type="button"
                  class="shrink-0 text-xs text-surface-400 underline transition-colors hover:text-danger-500 dark:hover:text-danger-400"
                  @click="form.validThrough = ''"
                >
                  Clear
                </button>
              </div>
              <p class="mt-1.5 text-xs text-surface-400 dark:text-surface-500">Leave blank if there is no fixed expiry date.</p>
            </div>
          </div>
        </section>

        <div class="flex items-center justify-start pb-2">
          <button
            type="submit"
            :disabled="isSavingPosting"
            class="ui-button ui-button-primary h-10 px-5 text-sm"
          >
            <Save class="size-4" />
            {{ isSavingPosting ? 'Saving...' : 'Save application details' }}
          </button>
        </div>
      </form>

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
              <span class="factory-requirement-option-title block text-sm font-medium">Require resume/CV</span>
              <span class="factory-requirement-option-description text-xs">Candidates must upload a file.</span>
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
              <span class="factory-requirement-option-title block text-sm font-medium">Ask for cover letter</span>
              <span class="factory-requirement-option-description text-xs">Candidates can write a cover letter.</span>
            </div>
          </button>
        </div>
        <button
          type="button"
          :disabled="isSavingRequirements"
          class="ui-button ui-button-primary px-4 py-2 text-sm"
          @click="saveRequirements"
        >
          {{ isSavingRequirements ? 'Saving…' : 'Save requirements' }}
        </button>
        <p v-if="requirementsError" class="mt-2 text-xs text-danger-600 dark:text-danger-400">
          {{ requirementsError }}
        </p>
      </div>

      <!-- Compliance Questions -->
      <div class="ui-panel p-5 mb-6">
        <div class="mb-3 flex items-center gap-2">
          <ShieldCheck class="size-4 text-surface-500 dark:text-surface-400" />
          <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-300">Compliance questions</h2>
        </div>
        <p class="mb-4 text-xs text-surface-400 dark:text-surface-500">
          Add voluntary self-identification questions for US equal employment opportunity reporting.
        </p>

        <div class="mb-4 space-y-3">
          <button
            type="button"
            class="ui-selectable-panel relative flex w-full items-center gap-3 p-4 text-left transition-colors"
            :class="applicationComplianceEnabled ? 'ui-selectable-panel-active' : ''"
            :aria-pressed="applicationComplianceEnabled"
            @click="applicationComplianceEnabled = !applicationComplianceEnabled"
          >
            <span
              v-if="applicationComplianceEnabled"
              class="ui-pill ui-pill-brand absolute right-3 top-3 size-5 justify-center p-0"
              aria-hidden="true"
            >
              <Check class="size-3" />
            </span>
            <div>
              <span class="factory-requirement-option-title block text-sm font-medium">Show voluntary self-identification</span>
              <span class="factory-requirement-option-description text-xs">Answers stay separate from candidate profiles and application questions.</span>
            </div>
          </button>

          <div
            v-if="applicationComplianceEnabled"
            class="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <label class="ui-list-row flex cursor-pointer items-start gap-3 p-3">
              <input
                v-model="includeEeo"
                type="checkbox"
                class="mt-0.5 size-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 dark:border-surface-600"
              />
              <span>
                <span class="block text-sm font-medium text-surface-900 dark:text-surface-100">EEO demographics</span>
                <span class="text-xs text-surface-400 dark:text-surface-500">Sex and race / ethnicity</span>
              </span>
            </label>
            <label class="ui-list-row flex cursor-pointer items-start gap-3 p-3">
              <input
                v-model="includeVeteran"
                type="checkbox"
                class="mt-0.5 size-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 dark:border-surface-600"
              />
              <span>
                <span class="block text-sm font-medium text-surface-900 dark:text-surface-100">Veteran status</span>
                <span class="text-xs text-surface-400 dark:text-surface-500">Protected veteran self-ID</span>
              </span>
            </label>
            <label class="ui-list-row flex cursor-pointer items-start gap-3 p-3">
              <input
                v-model="includeDisability"
                type="checkbox"
                class="mt-0.5 size-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 dark:border-surface-600"
              />
              <span>
                <span class="block text-sm font-medium text-surface-900 dark:text-surface-100">Disability status</span>
                <span class="text-xs text-surface-400 dark:text-surface-500">US disability self-ID</span>
              </span>
            </label>
          </div>
        </div>

        <button
          type="button"
          :disabled="isSavingCompliance"
          class="ui-button ui-button-primary px-4 py-2 text-sm"
          @click="saveComplianceQuestions"
        >
          {{ isSavingCompliance ? 'Saving...' : 'Save compliance questions' }}
        </button>
        <p v-if="complianceError" class="mt-2 text-xs text-danger-600 dark:text-danger-400">
          {{ complianceError }}
        </p>
      </div>

      <!-- Application Form Questions -->
      <div class="ui-panel p-5 mb-6">
        <div class="flex items-center gap-2 mb-3">
          <FileText class="size-4 text-surface-500 dark:text-surface-400" />
          <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-300">Custom Questions</h2>
        </div>
        <p class="text-xs text-surface-400 dark:text-surface-500 mb-4">
          Customize the questions applicants must answer when applying. All applications include name, email, and phone by default.
        </p>
        <JobQuestions :job-id="jobId" />
      </div>

      <!-- Tracking Links for this Job -->
      <div class="ui-panel p-5">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <Radio class="size-4 text-surface-500 dark:text-surface-400" />
            <NuxtLink
              :to="localePath({ path: '/dashboard/source-tracking', query: { jobId } })"
              class="text-sm font-semibold text-surface-700 dark:text-surface-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              Tracking Links
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
    </template>

    <!-- ═══════════════════════════════════════ -->
    <!-- Modal: Application preview              -->
    <!-- ═══════════════════════════════════════ -->
    <Teleport to="body">
      <div
        v-if="showApplicationPreview && job"
        class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50 grid place-items-center p-4"
        @click.self="showApplicationPreview = false"
      >
        <div class="ui-modal-panel relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
          <div class="ui-panel-header flex items-center justify-between px-6 py-4">
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">Applicant view</p>
              <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Application Preview</h2>
            </div>
            <button
              type="button"
              class="ui-button ui-button-ghost size-8 p-0"
              aria-label="Close preview"
              @click="showApplicationPreview = false"
            >
              <X class="size-4" />
            </button>
          </div>
          <div class="overflow-y-auto px-6 py-5">
            <div class="mx-auto max-w-2xl">
              <div class="mb-5 border border-white/10 bg-black p-5 text-white">
                <p class="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">Factory Careers</p>
                <h3 class="text-2xl font-semibold">Apply for {{ job.title }}</h3>
                <p class="mt-2 text-sm text-white/60">
                  This is a preview of the form candidates will complete.
                </p>
              </div>

              <div class="space-y-5 border border-surface-200 bg-surface-50 p-5 dark:border-surface-800 dark:bg-surface-950/70">
                <section>
                  <h4 class="mb-4 text-sm font-semibold text-surface-900 dark:text-surface-100">Contact information</h4>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <label class="block text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400">
                      Name <span class="text-brand-600 dark:text-brand-400">*</span>
                      <input disabled placeholder="First and last name" class="ui-field mt-1 px-3 py-2 text-sm opacity-80" />
                    </label>
                    <label class="block text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400">
                      Email <span class="text-brand-600 dark:text-brand-400">*</span>
                      <input disabled placeholder="you@example.com" class="ui-field mt-1 px-3 py-2 text-sm opacity-80" />
                    </label>
                    <label class="block text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400">
                      Phone
                      <input disabled placeholder="Optional" class="ui-field mt-1 px-3 py-2 text-sm opacity-80" />
                    </label>
                  </div>
                </section>

                <section class="border-t border-surface-200 pt-5 dark:border-surface-800">
                  <h4 class="mb-4 text-sm font-semibold text-surface-900 dark:text-surface-100">Location</h4>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <label class="block text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400">
                      Country <span class="text-brand-600 dark:text-brand-400">*</span>
                      <select disabled class="ui-field mt-1 px-3 py-2 text-sm opacity-80">
                        <option>United States</option>
                      </select>
                    </label>
                    <label class="block text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400">
                      State <span class="text-brand-600 dark:text-brand-400">*</span>
                      <select disabled class="ui-field mt-1 px-3 py-2 text-sm opacity-80">
                        <option>Select state</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section
                  v-if="requireResume || requireCoverLetter"
                  class="space-y-4 border-t border-surface-200 pt-5 dark:border-surface-800"
                >
                  <div v-if="requireResume">
                    <p class="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400">
                      Resume / CV <span class="text-brand-600 dark:text-brand-400">*</span>
                    </p>
                    <div class="border border-dashed border-surface-300 px-4 py-5 text-center text-sm text-surface-500 dark:border-surface-700 dark:text-surface-400">
                      Upload PDF, DOC, or DOCX
                    </div>
                  </div>
                  <label
                    v-if="requireCoverLetter"
                    class="block text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400"
                  >
                    Cover Letter
                    <textarea disabled rows="5" placeholder="Tell us why this role interests you." class="ui-field mt-1 px-3 py-2 text-sm opacity-80"></textarea>
                  </label>
                </section>

                <section
                  v-if="previewQuestions.length > 0"
                  class="space-y-4 border-t border-surface-200 pt-5 dark:border-surface-800"
                >
                  <h4 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Additional questions</h4>
                  <div
                    v-for="q in previewQuestions"
                    :key="q.id"
                    class="border border-surface-200 p-4 dark:border-surface-800"
                  >
                    <div class="mb-2 flex flex-wrap items-center gap-2">
                      <p class="text-sm font-medium text-surface-900 dark:text-surface-100">{{ q.label }}</p>
                      <span v-if="q.required" class="ui-pill ui-pill-brand">Required</span>
                    </div>
                    <p v-if="q.description" class="mb-3 text-xs text-surface-500 dark:text-surface-400">
                      {{ q.description }}
                    </p>
                    <select
                      v-if="q.type === 'single_select' || q.type === 'multi_select'"
                      disabled
                      class="ui-field px-3 py-2 text-sm opacity-80"
                    >
                      <option>{{ q.options?.[0] ?? 'Select an option' }}</option>
                    </select>
                    <textarea
                      v-else-if="q.type === 'long_text'"
                      disabled
                      rows="4"
                      :placeholder="previewQuestionTypeLabels[q.type]"
                      class="ui-field px-3 py-2 text-sm opacity-80"
                    ></textarea>
                    <div
                      v-else-if="q.type === 'file_upload'"
                      class="border border-dashed border-surface-300 px-4 py-4 text-sm text-surface-500 dark:border-surface-700 dark:text-surface-400"
                    >
                      Upload file
                    </div>
                    <input
                      v-else
                      disabled
                      :placeholder="previewQuestionTypeLabels[q.type] ?? 'Answer'"
                      class="ui-field px-3 py-2 text-sm opacity-80"
                    />
                  </div>
                </section>

                <section
                  v-if="previewComplianceEnabled"
                  class="space-y-4 border-t border-surface-200 pt-5 dark:border-surface-800"
                >
                  <div>
                    <h4 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Voluntary self-identification</h4>
                    <p class="mt-1 text-xs text-surface-500 dark:text-surface-400">
                      Voluntary, confidential, and not used in hiring decisions.
                    </p>
                  </div>
                  <div v-if="includeEeo" class="grid gap-3 sm:grid-cols-2">
                    <label class="block text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400">
                      Sex
                      <select disabled class="ui-field mt-1 px-3 py-2 text-sm opacity-80">
                        <option>Prefer not to answer</option>
                      </select>
                    </label>
                    <label class="block text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400">
                      Race / ethnicity
                      <select disabled class="ui-field mt-1 px-3 py-2 text-sm opacity-80">
                        <option>Prefer not to answer</option>
                      </select>
                    </label>
                  </div>
                  <label
                    v-if="includeVeteran"
                    class="block text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400"
                  >
                    Veteran status
                    <select disabled class="ui-field mt-1 px-3 py-2 text-sm opacity-80">
                      <option>Prefer not to answer</option>
                    </select>
                  </label>
                  <label
                    v-if="includeDisability"
                    class="block text-xs font-semibold uppercase tracking-[0.12em] text-surface-500 dark:text-surface-400"
                  >
                    Disability status
                    <select disabled class="ui-field mt-1 px-3 py-2 text-sm opacity-80">
                      <option>Prefer not to answer</option>
                    </select>
                  </label>
                </section>

                <div class="border-t border-surface-200 pt-5 dark:border-surface-800">
                  <button type="button" disabled class="factory-button-cta factory-button-premium h-10 px-5 opacity-80">
                    Submit Application
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

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
              <FactorySelect
                id="link-channel"
                v-model="newLink.channel"
                :options="[
                  ...['linkedin', 'indeed', 'glassdoor', 'ziprecruiter', 'monster', 'handshake', 'angellist', 'wellfound', 'dice', 'stackoverflow', 'weworkremotely', 'remoteok', 'builtin', 'hired', 'google_jobs'].map(ch => ({ value: ch, label: getSourceChannelLabel(ch) })),
                  ...['facebook', 'twitter', 'instagram', 'tiktok', 'reddit', 'referral', 'career_site', 'email', 'event', 'agency', 'direct', 'custom', 'other'].map(ch => ({ value: ch, label: getSourceChannelLabel(ch) }))
                ]"
              />
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

    <!-- Error -->
    <div
      v-if="fetchStatus !== 'pending' && !job && error"
      class="ui-alert ui-alert-danger p-4 text-sm"
    >
      {{ error.statusCode === 404 ? 'Job not found.' : 'Failed to load job.' }}
      <NuxtLink :to="$localePath('/dashboard')" class="underline ml-1">Back to Jobs</NuxtLink>
    </div>
  </div>
</template>
