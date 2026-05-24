<script setup lang="ts">
import { MapPin, Briefcase, ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-vue-next'

definePageMeta({
  layout: 'public',
  publicPinnedNav: true,
  publicWide: true,
})

const route = useRoute()

/** Forward source-tracking query params (?ref=, utm_*) through navigation */
const sourceQuery = computed(() => {
  const q: Record<string, string> = {}
  if (route.query.ref) q.ref = route.query.ref as string
  if (route.query.utm_source) q.utm_source = route.query.utm_source as string
  if (route.query.utm_medium) q.utm_medium = route.query.utm_medium as string
  if (route.query.utm_campaign) q.utm_campaign = route.query.utm_campaign as string
  if (route.query.utm_term) q.utm_term = route.query.utm_term as string
  if (route.query.utm_content) q.utm_content = route.query.utm_content as string
  return q
})

useSeoMeta({
  title: 'Open Positions',
  description:
    'Browse open roles at Factory and submit your application directly.',
  ogTitle: 'Open Positions — Factory Careers',
  ogDescription:
    'Browse open Factory roles and submit your application directly.',
  ogType: 'website',
  ogImage: '/factory-careers-og.png',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Open Positions — Factory Careers',
  twitterDescription:
    'Browse open Factory roles and apply directly.',
})

// ─────────────────────────────────────────────
// Query state
// ─────────────────────────────────────────────

const page = ref(1)
const searchInput = ref('')
const searchQuery = ref('')
const typeFilter = ref<string | undefined>(undefined)
const typeDropdownOpen = ref(false)
const typeDropdownRef = ref<HTMLElement | null>(null)

// Debounce search input
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchQuery.value = val.trim()
    page.value = 1
  }, 300)
})

// Reset page when filters change
watch(typeFilter, () => {
  page.value = 1
})

const queryParams = computed(() => ({
  page: page.value,
  limit: 20,
  ...(searchQuery.value && { search: searchQuery.value }),
  ...(typeFilter.value && { type: typeFilter.value }),
}))

const { data, status: fetchStatus, error, refresh } = useFetch('/api/public/jobs', {
  key: 'public-jobs',
  query: queryParams,
})

const jobs = computed(() => data.value?.data ?? [])
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.ceil(total.value / 20))

// ─────────────────────────────────────────────
// i18n-aware display helpers
// ─────────────────────────────────────────────
const { locale } = useI18n()

const typeLabels: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

const typeOptions = [
  { label: 'All types', value: undefined },
  { label: 'Full-time', value: 'full_time' },
  { label: 'Part-time', value: 'part_time' },
  { label: 'Contract', value: 'contract' },
  { label: 'Internship', value: 'internship' },
] as const

const selectedTypeLabel = computed(() => typeOptions.find(option => option.value === typeFilter.value)?.label ?? 'All types')

function setTypeFilter(value: string | undefined) {
  typeFilter.value = value
  typeDropdownOpen.value = false
}

function handleTypeDropdownClickOutside(event: MouseEvent) {
  if (typeDropdownRef.value && !typeDropdownRef.value.contains(event.target as Node)) {
    typeDropdownOpen.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', handleTypeDropdownClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleTypeDropdownClickOutside))

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatType(type?: string | null) {
  if (!type) return 'Role'
  return typeLabels[type] ?? type
}

function formatPostedDate(activeFrom?: string | null, createdAt?: string | null) {
  const date = activeFrom ?? createdAt
  return date ? formatDate(date) : 'recently'
}
</script>

<template>
  <div>
    <!-- Page header -->
    <div class="mb-10 border-b border-white/10 pb-8">
      <p class="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand-500">
        Factory Careers
      </p>
      <h1 class="text-5xl font-light leading-[0.96] tracking-tight text-white sm:text-6xl">Open Positions</h1>
      <p class="mt-5 max-w-xl text-base leading-7 text-white/62">
        Browse open roles, or introduce yourself if your path does not fit a posting yet.
      </p>
    </div>

    <!-- Filters -->
    <div class="mb-6 flex flex-col gap-3 sm:flex-row">
      <!-- Search -->
      <GooeySearchInput
        v-model="searchInput"
        aria-label="Search jobs"
        class="flex-1"
        placeholder="Search jobs by title or location…"
        reserve-expanded-space
        size="md"
        tone="inverse"
      />

      <!-- Type filter -->
      <div ref="typeDropdownRef" class="relative sm:w-40">
        <button
          type="button"
          class="flex h-10 min-h-10 w-full items-center justify-between border border-white/14 bg-black/35 px-3 py-0 text-left text-sm text-white outline-none transition-colors hover:border-brand-500/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          :aria-expanded="typeDropdownOpen"
          aria-haspopup="listbox"
          @click="typeDropdownOpen = !typeDropdownOpen"
          @keydown.escape="typeDropdownOpen = false"
        >
          <span>{{ selectedTypeLabel }}</span>
          <ChevronDown
            class="size-4 shrink-0 text-brand-500 transition-transform duration-150"
            :class="{ 'rotate-180': typeDropdownOpen }"
          />
        </button>

        <ul
          v-if="typeDropdownOpen"
          role="listbox"
          class="absolute right-0 z-30 mt-2 w-full border border-white/14 bg-black py-1 text-sm shadow-2xl shadow-black/50"
        >
          <li v-for="opt in typeOptions" :key="String(opt.value)" role="option" :aria-selected="opt.value === typeFilter">
            <button
              type="button"
              class="flex w-full items-center justify-between px-3 py-2 text-left text-white/68 transition-colors hover:bg-brand-500/12 hover:text-white"
              :class="opt.value === typeFilter ? 'text-white' : ''"
              @click="setTypeFilter(opt.value)"
            >
              <span>{{ opt.label }}</span>
              <Check v-if="opt.value === typeFilter" class="size-3.5 text-brand-500" />
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="fetchStatus === 'pending' && jobs.length === 0" class="py-16 text-center text-white/42">
      Loading positions…
    </div>

    <!-- Job list -->
    <div v-else-if="jobs.length > 0" class="space-y-3">
      <NuxtLink
        v-for="j in jobs"
        :key="j.id"
        :to="{ path: $localePath(`/jobs/${j.slug}`), query: sourceQuery }"
        class="group block border border-white/10 bg-white/[0.03] px-5 py-5 transition-colors hover:border-brand-500/60 hover:bg-brand-500/[0.07]"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <!-- Title -->
            <h2 class="text-xl font-light leading-tight text-white transition-colors group-hover:text-brand-500 sm:text-2xl">
              {{ j.title }}
            </h2>

            <!-- Meta -->
            <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/42">
              <span class="inline-flex items-center gap-1">
                <Briefcase class="size-3.5" />
                {{ formatType(j.type) }}
              </span>
              <span v-if="j.location" class="inline-flex items-center gap-1">
                <MapPin class="size-3.5" />
                {{ j.location }}
              </span>
              <span class="text-white/34">
                Posted {{ formatPostedDate(j.activeFrom, j.createdAt) }}
              </span>
            </div>

            <!-- Description preview -->
            <p v-if="j.description" class="mt-3 line-clamp-2 max-w-3xl text-sm leading-6 text-white/54">
              {{ j.description }}
            </p>
          </div>

          <!-- Arrow -->
          <ChevronRight class="mt-1 size-5 shrink-0 text-brand-500 transition-transform group-hover:translate-x-0.5" />
        </div>
      </NuxtLink>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-between pt-4">
        <button
          :disabled="page <= 1"
          class="inline-flex cursor-pointer items-center gap-1 border border-white/14 px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:border-brand-500/60 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          @click="page--"
        >
          <ChevronLeft class="size-4" />
          Previous
        </button>

        <span class="text-sm text-white/45">
          Page {{ page }} of {{ totalPages }}
        </span>

        <button
          :disabled="page >= totalPages"
          class="inline-flex cursor-pointer items-center gap-1 border border-white/14 px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:border-brand-500/60 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          @click="page++"
        >
          Next
          <ChevronRight class="size-4" />
        </button>
      </div>

      <!-- Total count -->
      <p class="pt-1 text-xs text-white/34">
        {{ total }} open position{{ total === 1 ? '' : 's' }}
      </p>
    </div>

    <!-- Error state -->
    <div
      v-else-if="error"
      class="border border-danger-500/30 bg-danger-950/55 p-4 text-sm text-danger-100"
    >
      Failed to load jobs. Please try again.
      <button class="ml-1 cursor-pointer text-brand-500 underline" @click="refresh()">Retry</button>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="border border-white/10 bg-white/[0.03] p-12 text-center"
    >
      <Briefcase class="mx-auto mb-3 size-10 text-brand-500" />
      <h3 class="mb-1 text-base font-semibold text-white">No open positions</h3>
      <p class="text-sm text-white/50">
        <template v-if="searchQuery || typeFilter">
          No jobs match your current filters. Try adjusting your search.
        </template>
        <template v-else>
          There are no open positions right now. Check back soon!
        </template>
      </p>
    </div>
  </div>
</template>
