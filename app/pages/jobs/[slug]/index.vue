<script setup lang="ts">
import { MapPin, Briefcase, Building2, ArrowLeft, ExternalLink, Calendar } from 'lucide-vue-next'

definePageMeta({
  layout: 'public',
  publicWide: true,
})

const route = useRoute()
const jobSlug = route.params.slug as string
const { track } = useTrack()

/** Forward source-tracking query params (?ref=, utm_*) to the apply page */
const applyQuery = computed(() => {
  const q: Record<string, string> = {}
  if (route.query.ref) q.ref = route.query.ref as string
  if (route.query.utm_source) q.utm_source = route.query.utm_source as string
  if (route.query.utm_medium) q.utm_medium = route.query.utm_medium as string
  if (route.query.utm_campaign) q.utm_campaign = route.query.utm_campaign as string
  if (route.query.utm_term) q.utm_term = route.query.utm_term as string
  if (route.query.utm_content) q.utm_content = route.query.utm_content as string
  return q
})

onMounted(() => track('public_job_viewed', { slug: jobSlug }))

const { data: job, status: fetchStatus, error: fetchError } = useFetch(
  `/api/public/jobs/${jobSlug}`,
  { key: `public-job-detail-${jobSlug}` },
)

function markdownToPlainText(markdown?: string | null): string {
  if (!markdown) return ''

  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const jobDescriptionPlain = computed(() => markdownToPlainText(job.value?.description))

// ─────────────────────────────────────────────
// SEO — Meta tags (title, description, OG, Twitter)
// ─────────────────────────────────────────────

useSeoMeta({
  title: computed(() => job.value ? job.value.title : 'Job Details'),
  description: computed(() => {
    if (!job.value) return 'View job details and apply'
    const loc = job.value.location ? ` in ${job.value.location}` : ''
    const org = job.value.organizationName ? ` at ${job.value.organizationName}` : ''
    return `Apply for ${job.value.title}${org}${loc}. ${jobDescriptionPlain.value.slice(0, 120)}`.trim()
  }),
  ogTitle: computed(() => job.value ? `${job.value.title} — Hiring Now` : 'Job Details'),
  ogDescription: computed(() => {
    if (!job.value) return 'View job details and apply'
    const org = job.value.organizationName ? ` at ${job.value.organizationName}` : ''
    return `Apply for ${job.value.title}${org}. ${job.value.location ?? 'Remote'}.`
  }),
  ogType: 'website',
  ogImage: '/factory-careers-og.png',
  twitterCard: 'summary_large_image',
  twitterTitle: computed(() => job.value?.title ?? 'Job Details'),
  twitterDescription: computed(() => {
    if (!job.value) return 'View job details and apply'
    return `Apply for ${job.value.title}. ${job.value.location ?? 'Remote'}.`
  }),
})

// ─────────────────────────────────────────────
// SEO — JSON-LD JobPosting structured data (Google Jobs)
// ─────────────────────────────────────────────

/** Map internal job type to schema.org employmentType */
function mapEmploymentType(type: string): string {
  const map: Record<string, string> = {
    full_time: 'FULL_TIME',
    part_time: 'PART_TIME',
    contract: 'CONTRACTOR',
    internship: 'INTERN',
  }
  return map[type] || 'OTHER'
}

// Build the JobPosting JSON-LD reactively
watchEffect(() => {
  if (!job.value) return

  const j = job.value
  const posting: Record<string, unknown> = {
    '@type': 'JobPosting',
    'title': j.title,
    'description': jobDescriptionPlain.value || j.title,
    'datePosted': j.createdAt,
    'employmentType': mapEmploymentType(j.type),
    'directApply': true,
  }

  // Hiring organization
  if (j.organizationName) {
    posting.hiringOrganization = {
      '@type': 'Organization',
      'name': j.organizationName,
      ...(j.organizationLogo ? { logo: j.organizationLogo } : {}),
    }
  }

  // Job location
  if (j.location) {
    posting.jobLocation = {
      '@type': 'Place',
      'address': {
        '@type': 'PostalAddress',
        'addressLocality': j.location,
      },
    }
  }

  // Remote work
  if (j.remoteStatus === 'remote') {
    posting.jobLocationType = 'TELECOMMUTE'
    posting.applicantLocationRequirements = {
      '@type': 'Country',
      'name': 'Anywhere',
    }
  }

  // Valid through
  if (j.validThrough) {
    posting.validThrough = new Date(j.validThrough).toISOString()
  }

  // Salary (baseSalary)
  if (j.salaryMin || j.salaryMax) {
    const value: Record<string, unknown> = { '@type': 'QuantitativeValue' }
    if (j.salaryMin && j.salaryMax) {
      value.minValue = j.salaryMin
      value.maxValue = j.salaryMax
    } else if (j.salaryMin) {
      value.value = j.salaryMin
    } else if (j.salaryMax) {
      value.value = j.salaryMax
    }
    if (j.salaryUnit) {
      value.unitText = j.salaryUnit
    }
    posting.baseSalary = {
      '@type': 'MonetaryAmount',
      'currency': j.salaryCurrency || 'USD',
      'value': value,
    }
  }

  // Inject JSON-LD as a <script> tag (works without @nuxtjs/seo)
  useHead({
    script: [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          ...posting,
        }),
      },
    ],
  })
})

const typeLabels: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

const { locale } = useI18n()

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(locale.value)
}

/** Format salary for display */
function formatSalary(min?: number | null, max?: number | null, currency?: string | null, unit?: string | null): string | null {
  if (!min && !max) return null
  const cur = currency || 'USD'
  const fmt = (v: number) => new Intl.NumberFormat(locale.value, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
  const unitLabel = unit ? `/${unit.toLowerCase().replace('year', 'yr').replace('month', 'mo').replace('hour', 'hr')}` : ''
  if (min && max) return `${fmt(min)} – ${fmt(max)}${unitLabel}`
  return `${fmt(min || max!)}${unitLabel}`
}
</script>

<template>
  <div>
    <!-- Loading skeleton -->
    <div v-if="fetchStatus === 'pending'" class="animate-pulse space-y-4">
      <div class="h-4 w-24 bg-white/10" />
      <div class="mt-4 overflow-hidden border border-white/10 bg-white/[0.03]">
        <div class="h-1 bg-brand-500/50" />
        <div class="space-y-4 p-6 sm:p-8">
          <div class="flex gap-2">
            <div class="h-6 w-28 bg-white/10" />
            <div class="h-6 w-20 bg-white/10" />
          </div>
          <div class="h-8 w-64 bg-white/10" />
          <div class="h-4 w-40 bg-white/10" />
          <div class="space-y-2 pt-2">
            <div class="h-3 w-full bg-white/10" />
            <div class="h-3 w-5/6 bg-white/10" />
            <div class="h-3 w-4/6 bg-white/10" />
          </div>
        </div>
      </div>
    </div>

    <!-- Not found -->
    <div v-else-if="fetchError" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="mb-5 flex size-16 items-center justify-center border border-white/10 bg-white/[0.03]">
        <Briefcase class="size-7 text-brand-500" />
      </div>
      <h1 class="mb-2 text-xl font-semibold text-white">Job Not Found</h1>
      <p class="mb-6 max-w-xs text-sm text-white/50">
        This position may no longer be available or is not currently accepting applications.
      </p>
      <NuxtLink
        :to="$localePath('/jobs')"
        class="factory-button-cta factory-button-outline inline-flex h-[48px] min-h-[48px] items-center justify-center gap-1.5 px-5 py-0 transition-colors"
      >
        <ArrowLeft class="size-4" />
        Browse all positions
      </NuxtLink>
    </div>

    <!-- Job detail -->
    <template v-else-if="job">
      <!-- Back link -->
      <AppBackLink
        :to="$localePath('/jobs')"
        class="mb-6"
      >
        All positions
      </AppBackLink>

      <!-- Job hero card -->
      <div class="mb-5 overflow-hidden border border-white/10 bg-white/[0.03]">
        <!-- Accent bar -->
        <div class="h-1 bg-brand-500" />

        <div class="p-6 sm:p-8">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <span
              v-if="job.organizationName"
              class="inline-flex items-center gap-1.5 border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/52"
            >
              <Building2 class="size-3.5 text-brand-500" />
              {{ job.organizationName }}
            </span>
            <span class="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-normal text-white/50 sm:justify-end">
              <Calendar class="size-3.5 text-brand-500" />
              <span>Posted</span>
              <time class="text-white/70" :datetime="job.createdAt">{{ formatDate(job.createdAt) }}</time>
            </span>
          </div>

          <h1 class="mt-6 text-4xl font-light leading-none tracking-tight text-white sm:text-5xl">
            {{ job.title }}
          </h1>

          <!-- Meta chips -->
          <div class="mt-5 flex flex-wrap items-center gap-2">
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
            <span
              v-if="job.salaryNegotiable || formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryUnit)"
              class="inline-flex items-center gap-1.5 border border-success-500/35 bg-success-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-success-300"
            >
              {{ job.salaryNegotiable ? 'Negotiable' : formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryUnit) }}
            </span>
          </div>

          <!-- Apply CTA inline -->
          <div class="mt-6 flex flex-col items-start gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center">
            <NuxtLink
              :to="{ path: $localePath(`/jobs/${job.slug}/apply`), query: applyQuery }"
              class="factory-button-cta factory-button-premium inline-flex h-[48px] min-h-[48px] items-center justify-center gap-2 px-6 py-0 transition-colors"
            >
              Apply Now
              <ExternalLink class="size-3.5" />
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Description card -->
      <div v-if="job.description" class="mb-5 overflow-hidden border border-white/10 bg-white/[0.03]">
        <div class="border-b border-white/10 px-6 py-4 sm:px-8">
          <h2 class="text-sm font-semibold text-white">About this role</h2>
        </div>
        <div class="px-6 py-6 sm:px-8">
          <MarkdownDescription :value="job.description" />
        </div>
      </div>

      <!-- Questions preview card -->
      <div v-if="job.questions && job.questions.length > 0" class="mb-5 overflow-hidden border border-white/10 bg-white/[0.03]">
        <div class="flex items-center justify-between border-b border-white/10 px-6 py-4 sm:px-8">
          <h2 class="text-sm font-semibold text-white">Application questions</h2>
          <span class="border border-white/10 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/52">
            {{ job.questions.length }}
          </span>
        </div>
        <div class="px-6 py-5 sm:px-8">
          <p class="mb-4 text-sm text-white/50">
            You'll be asked to answer {{ job.questions.length }}
            additional question{{ job.questions.length === 1 ? '' : 's' }} when you apply.
          </p>
          <ul class="divide-y divide-white/10">
            <li
              v-for="q in job.questions"
              :key="q.id"
              class="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span class="text-sm text-white/70">{{ q.label }}</span>
              <span
                v-if="q.required"
                class="shrink-0 border border-danger-500/35 bg-danger-500/10 px-2 py-0.5 text-xs font-medium text-danger-300"
              >
                Required
              </span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom Apply CTA -->
      <div class="flex flex-col items-start justify-between gap-4 border border-brand-500/35 bg-brand-500/[0.08] px-6 py-6 sm:flex-row sm:items-center sm:px-8">
        <div>
          <p class="text-sm font-semibold text-white">Ready to apply?</p>
          <p class="mt-0.5 text-sm text-white/52">Submit your application in just a few minutes.</p>
        </div>
        <NuxtLink
          :to="{ path: $localePath(`/jobs/${job.slug}/apply`), query: applyQuery }"
          class="factory-button-cta factory-button-premium inline-flex h-[48px] min-h-[48px] shrink-0 items-center justify-center gap-2 px-6 py-0 transition-colors"
        >
          Apply for this position
          <ExternalLink class="size-3.5" />
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
