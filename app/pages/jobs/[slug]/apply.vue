<script setup lang="ts">
import { MapPin, Briefcase, Building2 } from 'lucide-vue-next'
import { COUNTRY_OPTIONS, US_STATE_OPTIONS } from '~~/shared/location-options'

definePageMeta({
  layout: 'public',
})

const route = useRoute()
const jobSlug = route.params.slug as string
const { track } = useTrack()

// Capture source tracking params from the URL
const sourceRef = (route.query.ref as string) || undefined
const utmSource = (route.query.utm_source as string) || undefined
const utmMedium = (route.query.utm_medium as string) || undefined
const utmCampaign = (route.query.utm_campaign as string) || undefined
const utmTerm = (route.query.utm_term as string) || undefined
const utmContent = (route.query.utm_content as string) || undefined

onMounted(() => track('application_started', { slug: jobSlug }))

// Fetch public job data (no auth needed)
const { data: job, status: fetchStatus, error: fetchError } = useFetch(
  `/api/public/jobs/${jobSlug}`,
  { key: `public-job-${jobSlug}` },
)

useSeoMeta({
  title: computed(() => job.value ? `Apply — ${job.value.title}` : 'Apply'),
  description: computed(() => job.value?.description?.slice(0, 160) ?? 'Submit your application'),
  robots: 'noindex, nofollow',
})

// ─────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────

const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  country: 'United States',
  state: '',
  website: '', // honeypot
})

// Dynamic question responses: questionId → value
const responses = ref<Record<string, string | string[] | number | boolean>>({})

// File uploads: questionId → File object
const fileUploads = ref<Record<string, File>>({})

// Built-in document uploads (resume) and cover letter text
const resumeFile = ref<File | null>(null)
const coverLetterText = ref('')

const isSubmitting = ref(false)
const errors = ref<Record<string, string>>({})
const submitError = ref<string | null>(null)

const labelClass = 'mb-1.5 block text-sm font-medium text-white/70'
const errorMessageClass = 'mt-1.5 flex items-center gap-1 text-xs text-danger-300'

function fieldClass(hasError?: boolean) {
  return [
    'w-full border bg-black/35 px-3.5 py-2.5 text-sm text-white placeholder:text-white/38 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25',
    hasError ? 'border-danger-500/70 focus:border-danger-500 focus:ring-danger-500/25' : 'border-white/14',
  ]
}

function fileDropClass(hasError?: boolean) {
  return [
    'relative flex items-center gap-3 border border-dashed px-4 py-3 transition-colors',
    hasError ? 'border-danger-500/70 bg-danger-500/10' : 'border-white/14 bg-black/35',
  ]
}

/** Whether the form has any file_upload type questions OR built-in document fields */
const hasFileQuestions = computed(() => {
  const hasCustomFileQ = job.value?.questions?.some((q: { type: string }) => q.type === 'file_upload') ?? false
  const hasBuiltInFiles = !!resumeFile.value
  return hasCustomFileQ || hasBuiltInFiles
})

/**
 * Handle file selection from DynamicField.
 * Stores the File object separately from the model value.
 */
function handleFileSelected(questionId: string, file: File | null) {
  if (file) {
    fileUploads.value[questionId] = file
  } else {
    delete fileUploads.value[questionId]
  }
}

function validate(): boolean {
  errors.value = {}
  const maxSize = 10 * 1024 * 1024

  if (!form.value.firstName.trim()) errors.value.firstName = 'First name is required'
  if (!form.value.lastName.trim()) errors.value.lastName = 'Last name is required'
  if (!form.value.email.trim()) {
    errors.value.email = 'Email is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) {
    errors.value.email = 'Invalid email address'
  }
  if (!COUNTRY_OPTIONS.some((country) => country.value === form.value.country)) {
    errors.value.country = 'Country is required'
  }
  if (!US_STATE_OPTIONS.some((state) => state.value === form.value.state)) {
    errors.value.state = 'State is required'
  }

  // Validate required resume
  if (job.value?.requireResume && !resumeFile.value) {
    errors.value.resume = 'Resume/CV is required'
  }

  // Validate required cover letter
  if (job.value?.requireCoverLetter && !coverLetterText.value.trim()) {
    errors.value.coverLetter = 'Cover letter is required'
  } else if (coverLetterText.value.length > 10_000) {
    errors.value.coverLetter = 'Cover letter must be 10,000 characters or fewer.'
  }

  // Validate resume file size
  if (resumeFile.value && resumeFile.value.size > maxSize) {
    errors.value.resume = 'File too large. Maximum 10 MB.'
  }

  // Validate required custom questions
  if (job.value?.questions) {
    for (const q of job.value.questions) {
      if (q.required) {
        if (q.type === 'file_upload') {
          // For file uploads, check if a File was selected
          if (!fileUploads.value[q.id]) {
            errors.value[`q-${q.id}`] = 'This field is required'
          }
        } else {
          const val = responses.value[q.id]
          const isEmpty = val === undefined || val === null || val === '' ||
            (Array.isArray(val) && val.length === 0)

          if (isEmpty) {
            errors.value[`q-${q.id}`] = 'This field is required'
          }
        }
      }
    }
  }

  // Validate custom file upload sizes
  for (const [questionId, file] of Object.entries(fileUploads.value)) {
    if (file.size > maxSize) {
      errors.value[`q-${questionId}`] = 'File too large. Maximum 10 MB.'
    }
  }

  return Object.keys(errors.value).length === 0
}

async function handleSubmit() {
  submitError.value = null
  if (!validate()) return

  isSubmitting.value = true
  try {
    // Build responses array from the map (exclude file_upload questions — those go as files)
    const fileQuestionIds = new Set(
      job.value?.questions
        ?.filter((q: { type: string }) => q.type === 'file_upload')
        .map((q: { id: string }) => q.id) ?? [],
    )

    const responseArray = Object.entries(responses.value)
      .filter(([questionId, value]) => {
        if (fileQuestionIds.has(questionId)) return false
        if (value === undefined || value === null || value === '') return false
        if (Array.isArray(value) && value.length === 0) return false
        return true
      })
      .map(([questionId, value]) => ({ questionId, value }))

    // Determine if we need FormData (any files present — custom or built-in)
    const hasAnyFiles = Object.keys(fileUploads.value).length > 0
      || !!resumeFile.value

    if (hasAnyFiles) {
      // Use FormData when files are present
      const formData = new FormData()
      formData.append('firstName', form.value.firstName.trim())
      formData.append('lastName', form.value.lastName.trim())
      formData.append('email', form.value.email.trim())
      formData.append('country', form.value.country)
      formData.append('state', form.value.state)
      if (form.value.phone.trim()) {
        formData.append('phone', form.value.phone.trim())
      }
      if (form.value.website) {
        formData.append('website', form.value.website)
      }

      // Serialize non-file responses as JSON
      formData.append('responses', JSON.stringify(responseArray))

      // Append custom question files
      for (const [questionId, file] of Object.entries(fileUploads.value)) {
        formData.append(`file:${questionId}`, file)
      }

      // Append built-in resume
      if (resumeFile.value) {
        formData.append('resume', resumeFile.value)
      }
      // Append cover letter text
      if (coverLetterText.value.trim()) {
        formData.append('coverLetterText', coverLetterText.value.trim())
      }

      // Source tracking params
      if (sourceRef) formData.append('ref', sourceRef)
      if (utmSource) formData.append('utmSource', utmSource)
      if (utmMedium) formData.append('utmMedium', utmMedium)
      if (utmCampaign) formData.append('utmCampaign', utmCampaign)
      if (utmTerm) formData.append('utmTerm', utmTerm)
      if (utmContent) formData.append('utmContent', utmContent)

      await $fetch(`/api/public/jobs/${jobSlug}/apply`, {
        method: 'POST',
        body: formData,
      })
    } else {
      // No files — use JSON as before
      await $fetch(`/api/public/jobs/${jobSlug}/apply`, {
        method: 'POST',
        body: {
          firstName: form.value.firstName.trim(),
          lastName: form.value.lastName.trim(),
          email: form.value.email.trim(),
          phone: form.value.phone.trim() || undefined,
          country: form.value.country,
          state: form.value.state,
          website: form.value.website, // honeypot
          coverLetterText: coverLetterText.value.trim() || undefined,
          responses: responseArray,
          ref: sourceRef,
          utmSource,
          utmMedium,
          utmCampaign,
          utmTerm,
          utmContent,
        },
      })
    }

    track('application_submitted', { slug: jobSlug })
    await navigateTo(`/jobs/${jobSlug}/confirmation`)
  } catch (err: any) {
    const message = err.data?.statusMessage ?? 'Something went wrong. Please try again.'
    submitError.value = message

    // Surface file-related errors next to the resume field so the user knows what to fix
    const status = err.data?.statusCode ?? err.statusCode
    if (status === 400 && message.toLowerCase().includes('resume')) {
      errors.value.resume = message
    } else if (status === 502 && message.toLowerCase().includes('resume')) {
      errors.value.resume = message
    }
  } finally {
    isSubmitting.value = false
  }
}

// ─────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────

const typeLabels: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}
</script>

<template>
  <div>
    <!-- Loading skeleton -->
    <div v-if="fetchStatus === 'pending'" class="animate-pulse space-y-4">
      <div class="h-7 w-48 bg-white/10" />
      <div class="h-5 w-32 bg-white/10" />
      <div class="h-4 w-64 bg-white/10" />
      <div class="mt-8 h-48 border border-white/10 bg-white/[0.03]" />
    </div>

    <!-- Not found / not open -->
    <div v-else-if="fetchError" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="mb-5 flex size-16 items-center justify-center border border-white/10 bg-white/[0.03]">
        <Briefcase class="size-7 text-brand-500" />
      </div>
      <h1 class="mb-2 text-xl font-semibold text-white">Position Not Found</h1>
      <p class="mb-6 max-w-xs text-sm text-white/50">
        This position may have been filled or is no longer accepting applications.
      </p>
      <a
        :href="useRuntimeConfig().public.marketingUrl"
        class="factory-button-cta factory-button-premium inline-flex h-[48px] min-h-[48px] items-center justify-center gap-2 px-5 py-0 transition-colors"
      >
        Back to Home
      </a>
    </div>

    <!-- Application form -->
    <template v-else-if="job">

      <!-- Back link -->
      <AppBackLink
        :to="$localePath(`/jobs/${jobSlug}`)"
        class="mb-6"
      >
        Back to job details
      </AppBackLink>

      <!-- Job hero card -->
      <div class="mb-6 overflow-hidden border border-white/10 bg-white/[0.03]">
        <!-- Accent bar -->
        <div class="h-1 bg-brand-500" />

        <div class="p-6 sm:p-8">
          <!-- Meta chips -->
          <div class="mb-5 flex flex-wrap items-center gap-2">
            <span
              v-if="job.organizationName"
              class="inline-flex items-center gap-1.5 border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/52"
            >
              <Building2 class="size-3.5 text-brand-500" />
              {{ job.organizationName }}
            </span>
            <span class="inline-flex items-center gap-1.5 border border-brand-500/45 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
              <Briefcase class="size-3.5" />
              {{ typeLabels[job.type] ?? job.type }}
            </span>
            <span
              v-if="job.location"
              class="inline-flex items-center gap-1.5 border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/52"
            >
              <MapPin class="size-3.5 text-brand-500" />
              {{ job.location }}
            </span>
          </div>

          <h1 class="text-4xl font-light leading-none tracking-tight text-white sm:text-5xl">
            {{ job.title }}
          </h1>

          <div v-if="job.description" class="mt-6 border-t border-white/10 pt-5">
            <MarkdownDescription :value="job.description" />
          </div>
        </div>
      </div>

      <!-- Application form card -->
      <div class="overflow-hidden border border-white/10 bg-white/[0.03]">
        <!-- Card header -->
        <div class="border-b border-white/10 px-6 py-5 sm:px-8">
          <h2 class="text-base font-semibold text-white">Your application</h2>
          <p class="mt-0.5 text-sm text-white/50">Fields marked with <span class="text-danger-300">*</span> are required.</p>
        </div>

        <div class="px-6 py-6 sm:px-8 sm:py-8">
          <!-- Server error banner -->
          <div
            v-if="submitError"
            class="mb-6 flex items-start gap-3 border border-danger-500/35 bg-danger-500/10 px-4 py-3 text-sm text-danger-200"
            role="alert"
          >
            <svg class="mt-0.5 size-4 shrink-0 text-danger-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{{ submitError }}</span>
          </div>

          <form class="space-y-5" @submit.prevent="handleSubmit">
            <!-- Honeypot (hidden from humans) -->
            <div class="absolute -left-[9999px]" aria-hidden="true">
              <label for="website">Website</label>
              <input id="website" v-model="form.website" type="text" tabindex="-1" autocomplete="off" />
            </div>

            <!-- Name row -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- First Name -->
              <div>
                <label for="firstName" :class="labelClass">
                  First Name <span class="text-danger-300">*</span>
                </label>
                <input
                  id="firstName"
                  v-model="form.firstName"
                  type="text"
                  placeholder="Jane"
                  autocomplete="given-name"
                  :class="fieldClass(!!errors.firstName)"
                />
                <p v-if="errors.firstName" :class="errorMessageClass">
                  <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ errors.firstName }}
                </p>
              </div>

              <!-- Last Name -->
              <div>
                <label for="lastName" :class="labelClass">
                  Last Name <span class="text-danger-300">*</span>
                </label>
                <input
                  id="lastName"
                  v-model="form.lastName"
                  type="text"
                  placeholder="Doe"
                  autocomplete="family-name"
                  :class="fieldClass(!!errors.lastName)"
                />
                <p v-if="errors.lastName" :class="errorMessageClass">
                  <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ errors.lastName }}
                </p>
              </div>
            </div>

            <!-- Email -->
            <div>
              <label for="email" :class="labelClass">
                Email <span class="text-danger-300">*</span>
              </label>
              <input
                id="email"
                v-model="form.email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                :class="fieldClass(!!errors.email)"
              />
              <p v-if="errors.email" :class="errorMessageClass">
                <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {{ errors.email }}
              </p>
            </div>

            <!-- Phone -->
            <div>
              <label for="phone" :class="labelClass">
                Phone <span class="text-xs font-normal text-white/38">(optional)</span>
              </label>
              <input
                id="phone"
                v-model="form.phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                autocomplete="tel"
                :class="fieldClass(false)"
              />
            </div>

            <!-- Location -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="country" :class="labelClass">
                  Country <span class="text-danger-300">*</span>
                </label>
                <select
                  id="country"
                  v-model="form.country"
                  autocomplete="country-name"
                  :class="fieldClass(!!errors.country)"
                  @change="delete errors.country"
                >
                  <option disabled value="">Select country</option>
                  <option
                    v-for="country in COUNTRY_OPTIONS"
                    :key="country.value"
                    :value="country.value"
                  >
                    {{ country.label }}
                  </option>
                </select>
                <p v-if="errors.country" :class="errorMessageClass">
                  <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ errors.country }}
                </p>
              </div>

              <div>
                <label for="state" :class="labelClass">
                  State <span class="text-danger-300">*</span>
                </label>
                <select
                  id="state"
                  v-model="form.state"
                  autocomplete="address-level1"
                  :class="fieldClass(!!errors.state)"
                  @change="delete errors.state"
                >
                  <option disabled value="">Select state</option>
                  <option
                    v-for="state in US_STATE_OPTIONS"
                    :key="state.value"
                    :value="state.value"
                  >
                    {{ state.label }}
                  </option>
                </select>
                <p v-if="errors.state" :class="errorMessageClass">
                  <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ errors.state }}
                </p>
              </div>
            </div>

            <!-- Resume / Cover Letter uploads -->
            <template v-if="job.requireResume || job.requireCoverLetter">
              <div class="space-y-5 border-t border-white/10 pt-5">
                <!-- Resume -->
                <div v-if="job.requireResume">
                  <label for="resume" :class="labelClass">
                    Resume / CV <span class="text-danger-300">*</span>
                  </label>
                  <div
                    :class="fileDropClass(!!errors.resume)"
                  >
                    <svg class="size-5 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <div class="flex-1 min-w-0">
                      <p v-if="resumeFile" class="truncate text-sm text-white">{{ resumeFile.name }}</p>
                      <p v-else class="text-sm text-white/50">PDF, DOC, or DOCX — max 10 MB</p>
                    </div>
                    <label
                      for="resume"
                      class="factory-button-cta factory-button-cta-sm factory-button-outline inline-flex h-8 shrink-0 cursor-pointer items-center justify-center px-3 py-0 transition-colors"
                    >
                      {{ resumeFile ? 'Change' : 'Choose file' }}
                    </label>
                    <input
                      id="resume"
                      type="file"
                      accept=".pdf,.doc,.docx"
                      class="sr-only"
                      @change="(e: Event) => { const t = e.target as HTMLInputElement; resumeFile = t.files?.[0] ?? null; delete errors.resume }"
                    />
                  </div>
                  <p v-if="errors.resume" :class="errorMessageClass">
                    <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {{ errors.resume }}
                  </p>
                </div>

                <!-- Cover Letter -->
                <div v-if="job.requireCoverLetter">
                  <label for="coverLetterText" :class="labelClass">
                    Cover Letter <span class="text-danger-300">*</span>
                  </label>
                  <textarea
                    id="coverLetterText"
                    v-model="coverLetterText"
                    rows="6"
                    maxlength="10000"
                    placeholder="Tell us why you're interested in this role…"
                    :class="fieldClass(!!errors.coverLetter)"
                    @input="delete errors.coverLetter"
                  />
                  <p v-if="errors.coverLetter" :class="errorMessageClass">
                    <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {{ errors.coverLetter }}
                  </p>
                  <p v-else class="mt-1.5 text-xs text-white/40">Max 10,000 characters.</p>
                </div>
              </div>
            </template>

            <!-- Custom questions -->
            <template v-if="job.questions && job.questions.length > 0">
              <div class="border-t border-white/10 pt-5">
                <p class="mb-4 text-sm font-medium text-white">Additional questions</p>
                <div class="space-y-5">
                  <DynamicField
                    v-for="q in job.questions"
                    :key="q.id"
                    v-model="responses[q.id]"
                    :question="q"
                    :error="errors[`q-${q.id}`]"
                    @file-selected="handleFileSelected"
                  />
                </div>
              </div>
            </template>

            <!-- Submit row -->
            <div class="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center">
              <button
                type="submit"
                :disabled="isSubmitting"
                class="factory-button-cta factory-button-premium inline-flex h-[48px] min-h-[48px] items-center justify-center gap-2 px-7 py-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <!-- Spinner -->
                <svg
                  v-if="isSubmitting"
                  class="size-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {{ isSubmitting ? 'Submitting…' : 'Submit Application' }}
              </button>
              <p class="text-xs text-white/42">Your information is kept confidential.</p>
            </div>
          </form>
        </div>
      </div>
    </template>
  </div>
</template>
