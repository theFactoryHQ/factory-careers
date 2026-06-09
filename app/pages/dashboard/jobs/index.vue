<script setup lang="ts">
import { dashboardListPageKeepalive } from '~~/shared/dashboard-keepalive'
import {
  Briefcase, Bell, Plus, Kanban,
  MapPin, Search, SlidersHorizontal, X,
  LayoutGrid, List, Table2, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-vue-next'
import { getJobStatusBadgeClass } from '~/utils/status-display'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
  keepalive: dashboardListPageKeepalive,
})

useSeoMeta({
  title: 'My Jobs — Factory Careers',
  description: 'Your active job postings',
})

const { activeOrg } = useCurrentOrg()
const localePath = useLocalePath()
const { allowed: canCreateJob } = usePermission({ job: ['create'] })

// ─────────────────────────────────────────────
// Stage config for clickable pipeline counts
// ─────────────────────────────────────────────

const stageConfig = [
  { key: 'new', label: 'New', textColor: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-950/40' },
  { key: 'screening', label: 'Screening', textColor: 'text-violet-600 dark:text-violet-400', bgColor: 'bg-violet-50 dark:bg-violet-950/40' },
  { key: 'interview', label: 'Interview', textColor: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-950/40' },
  { key: 'offer', label: 'Offer', textColor: 'text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-50 dark:bg-teal-950/40' },
  { key: 'hired', label: 'Hired', textColor: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-950/40' },
  { key: 'rejected', label: 'Rejected', textColor: 'text-surface-500 dark:text-surface-400', bgColor: 'bg-surface-100 dark:bg-surface-800' },
] as const

function getStageCount(pipeline: any, key: string): number {
  return pipeline?.[key] ?? 0
}

// ─────────────────────────────────────────────
// Fetch jobs with pipeline data
// ─────────────────────────────────────────────

const { data, jobs, total, fetchStatus, error, refresh } = useJobs()

const { showSkeleton, isRevalidating } = useStaleFetchUi(fetchStatus, data)

const typeLabels: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

// ─────────────────────────────────────────────
// View mode (gallery | table)
// ─────────────────────────────────────────────

type ViewMode = 'gallery' | 'list' | 'table'

// ─────────────────────────────────────────────
// Search + filters
// ─────────────────────────────────────────────

const search = ref('')
const drawerOpen = ref(false)

type StatusFilter = 'open' | 'draft' | 'closed' | 'archived'
type TypeFilter = 'full_time' | 'part_time' | 'contract' | 'internship'
type ExperienceFilter = 'junior' | 'mid' | 'senior' | 'lead'
type RemoteFilter = 'remote' | 'hybrid' | 'onsite'

const statusFilter = ref<StatusFilter[]>([])
const typeFilter = ref<TypeFilter[]>([])
const experienceFilter = ref<ExperienceFilter[]>([])
const remoteFilter = ref<RemoteFilter[]>([])

const statusOptions: { value: StatusFilter, label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'draft', label: 'Draft' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
]
const typeOptions: { value: TypeFilter, label: string }[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
]
const experienceOptions: { value: ExperienceFilter, label: string }[] = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
]
const remoteOptions: { value: RemoteFilter, label: string }[] = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
]

function toggleIn<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
}

function toggleStatus(v: StatusFilter) { statusFilter.value = toggleIn(statusFilter.value, v) }
function toggleType(v: TypeFilter) { typeFilter.value = toggleIn(typeFilter.value, v) }
function toggleExperience(v: ExperienceFilter) { experienceFilter.value = toggleIn(experienceFilter.value, v) }
function toggleRemote(v: RemoteFilter) { remoteFilter.value = toggleIn(remoteFilter.value, v) }

const activeFilterCount = computed(() =>
  statusFilter.value.length
  + typeFilter.value.length
  + experienceFilter.value.length
  + remoteFilter.value.length,
)

function clearFilters() {
  statusFilter.value = []
  typeFilter.value = []
  experienceFilter.value = []
  remoteFilter.value = []
}

const filteredJobs = computed(() => {
  const q = search.value.trim().toLowerCase()
  return jobs.value.filter((j: any) => {
    if (q) {
      const hay = `${j.title ?? ''} ${j.location ?? ''} ${j.description ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (statusFilter.value.length && !statusFilter.value.includes(j.status)) return false
    if (typeFilter.value.length && !typeFilter.value.includes(j.type)) return false
    if (experienceFilter.value.length) {
      if (!j.experienceLevel || !experienceFilter.value.includes(j.experienceLevel)) return false
    }
    if (remoteFilter.value.length) {
      if (!j.remoteStatus || !remoteFilter.value.includes(j.remoteStatus)) return false
    }
    return true
  })
})

// ─────────────────────────────────────────────
// Table sort
// ─────────────────────────────────────────────

type SortKey = 'title' | 'status' | 'type' | 'location' | 'new' | 'active' | 'created'
type SortDir = 'asc' | 'desc'

const sortKey = ref<SortKey>('created')
const sortDir = ref<SortDir>('desc')

const sortKeyOptions: { value: SortKey, label: string }[] = [
  { value: 'created', label: 'Date created' },
  { value: 'title', label: 'Title' },
  { value: 'status', label: 'Status' },
  { value: 'type', label: 'Employment type' },
  { value: 'location', label: 'Location' },
  { value: 'new', label: 'New applicants' },
  { value: 'active', label: 'Active candidates' },
]

const sortDirOptions: { value: SortDir, label: string }[] = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
]

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortKey.value = key
    sortDir.value = key === 'created' || key === 'new' || key === 'active' ? 'desc' : 'asc'
  }
}

// ─────────────────────────────────────────────
// Sort jobs by urgency (gallery) or column (table)
// ─────────────────────────────────────────────

const statusPriority: Record<string, number> = {
  open: 0,
  draft: 1,
  closed: 2,
  archived: 3,
}

function totalActive(pipeline: any) {
  return (pipeline?.new ?? 0) + (pipeline?.screening ?? 0) + (pipeline?.interview ?? 0) + (pipeline?.offer ?? 0) + (pipeline?.hired ?? 0)
}

const sortedJobs = computed(() => {
  const list = [...filteredJobs.value]
  if (sortKey.value !== 'created' || sortDir.value !== 'desc') {
    // Table-style sort
    const dir = sortDir.value === 'asc' ? 1 : -1
    list.sort((a, b) => {
      switch (sortKey.value) {
        case 'title': return dir * (a.title ?? '').localeCompare(b.title ?? '')
        case 'status': return dir * (statusPriority[a.status] ?? 9) - dir * (statusPriority[b.status] ?? 9)
        case 'type': return dir * (a.type ?? '').localeCompare(b.type ?? '')
        case 'location': return dir * (a.location ?? '').localeCompare(b.location ?? '')
        case 'new': return dir * ((a.pipeline?.new ?? 0) - (b.pipeline?.new ?? 0))
        case 'active': return dir * (totalActive(a.pipeline) - totalActive(b.pipeline))
        case 'created': return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        default: return 0
      }
    })
    return list
  }

  // Default gallery urgency sort
  list.sort((a, b) => {
    const aPriority = statusPriority[a.status] ?? 9
    const bPriority = statusPriority[b.status] ?? 9
    if (aPriority !== bPriority) return aPriority - bPriority
    const aNew = a.pipeline?.new ?? 0
    const bNew = b.pipeline?.new ?? 0
    if (aNew !== bNew) return bNew - aNew
    const aActive = totalActive(a.pipeline)
    const bActive = totalActive(b.pipeline)
    if (aActive !== bActive) return bActive - aActive
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
  return list
})

// ─────────────────────────────────────────────
// Group jobs: needs attention + others (gallery only)
// ─────────────────────────────────────────────

const jobsNeedingAttention = computed(() =>
  sortedJobs.value.filter(j => j.status === 'open' && (j.pipeline?.new ?? 0) > 0),
)

const otherJobs = computed(() =>
  sortedJobs.value.filter(j => !(j.status === 'open' && (j.pipeline?.new ?? 0) > 0)),
)

// ─────────────────────────────────────────────
// Saved views
// ─────────────────────────────────────────────

type JobsViewSettings = {
  statusFilter: StatusFilter[]
  typeFilter: TypeFilter[]
  experienceFilter: ExperienceFilter[]
  remoteFilter: RemoteFilter[]
  viewMode: ViewMode
  sortKey: SortKey
  sortDir: SortDir
}

const defaultSettings: JobsViewSettings = {
  statusFilter: [],
  typeFilter: [],
  experienceFilter: [],
  remoteFilter: [],
  viewMode: 'gallery',
  sortKey: 'created',
  sortDir: 'desc',
}

const viewMode = ref<ViewMode>('gallery')

const currentSettings = computed<JobsViewSettings>(() => ({
  statusFilter: [...statusFilter.value],
  typeFilter: [...typeFilter.value],
  experienceFilter: [...experienceFilter.value],
  remoteFilter: [...remoteFilter.value],
  viewMode: viewMode.value,
  sortKey: sortKey.value,
  sortDir: sortDir.value,
}))

function applySettings(s: JobsViewSettings) {
  statusFilter.value = [...(s.statusFilter ?? [])]
  typeFilter.value = [...(s.typeFilter ?? [])]
  experienceFilter.value = [...(s.experienceFilter ?? [])]
  remoteFilter.value = [...(s.remoteFilter ?? [])]
  viewMode.value = s.viewMode ?? 'gallery'
  sortKey.value = s.sortKey ?? 'created'
  sortDir.value = s.sortDir ?? 'desc'
}

const {
  views,
  activeViewId,
  deleteView,
  setDefault,
  isDirty,
  onSelectView,
  onSaveView,
  onUpdateView,
} = useSavedViewState<JobsViewSettings>('jobs', defaultSettings, currentSettings, applySettings)

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const isEmpty = computed(() => jobs.value.length === 0)
const noResults = computed(() => !isEmpty.value && filteredJobs.value.length === 0)
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <!-- ─── Header ─── -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">My Jobs</h1>
      <p v-if="activeOrg" class="text-sm text-surface-500 dark:text-surface-400 mt-1">
        {{ activeOrg.name }}
      </p>
    </div>

    <StaleRevalidateBar v-if="isRevalidating" />

    <!-- ─── Loading ─── -->
    <div v-if="showSkeleton">
      <div class="space-y-4">
        <div
          v-for="i in 3"
          :key="i"
          class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-5 animate-pulse"
        >
          <div class="flex items-center justify-between mb-4">
            <div class="h-5 w-48 bg-surface-200 dark:bg-surface-700 rounded" />
            <div class="h-5 w-16 bg-surface-200 dark:bg-surface-700 rounded-full" />
          </div>
          <div class="h-2 w-full bg-surface-200 dark:bg-surface-700 rounded mb-3" />
          <div class="flex gap-4">
            <div class="h-4 w-20 bg-surface-200 dark:bg-surface-700 rounded" />
            <div class="h-4 w-20 bg-surface-200 dark:bg-surface-700 rounded" />
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Error ─── -->
    <div
      v-else-if="error"
      class="rounded-lg border border-danger-200 dark:border-danger-900 bg-danger-50 dark:bg-danger-950 p-4 text-sm text-danger-700 dark:text-danger-400"
    >
      Failed to load jobs.
      <button class="underline ml-1 cursor-pointer" @click="refresh()">Retry</button>
    </div>

    <!-- ─── Empty state ─── -->
    <div v-else-if="isEmpty" class="flex flex-col items-center justify-center py-20">
      <div class="ui-empty-panel max-w-md">
        <Briefcase class="size-12 text-brand-400 mx-auto mb-4" />
        <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-2">
          Welcome to Factory Careers
        </h2>
        <p class="text-sm text-surface-500 dark:text-surface-400 mb-6 leading-relaxed">
          Create your first job posting to start receiving and managing candidates.
        </p>
        <NuxtLink
          v-if="canCreateJob"
          :to="$localePath('/dashboard/jobs/new')"
          class="factory-button-cta factory-button-premium inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors no-underline"
        >
          <Plus class="size-4" />
          Create Your First Job
        </NuxtLink>
      </div>
    </div>

    <!-- ─── Jobs content ─── -->
    <template v-else>
      <!-- ─── Toolbar: Search + Views + Filters + View Toggle ─── -->
      <div class="factory-dashboard-toolbar flex items-center gap-2 mb-4">
        <GooeySearchInput
          v-model="search"
          aria-label="Search jobs"
          class="min-w-0 flex-1 sm:max-w-sm"
          placeholder="Search jobs by title, location, or description"
          reserve-expanded-space
        />

        <!-- Saved views menu -->
        <SavedViewsMenu
          :views="views"
          :active-view-id="activeViewId"
          :is-dirty="isDirty"
          @select="onSelectView"
          @save="onSaveView"
          @update="onUpdateView"
          @delete="deleteView"
          @set-default="setDefault"
        />

        <!-- View mode toggle -->
        <div class="factory-view-toggle inline-flex h-10 rounded-lg border overflow-hidden">
          <button
            type="button"
            class="inline-flex h-full items-center gap-1.5 px-3 text-sm font-medium transition-colors"
            :class="{ 'is-active': viewMode === 'gallery' }"
            title="Gallery view"
            @click="viewMode = 'gallery'"
          >
            <LayoutGrid class="size-4" />
          </button>
          <button
            type="button"
            class="inline-flex h-full items-center gap-1.5 border-l border-white/10 px-3 text-sm font-medium transition-colors"
            :class="{ 'is-active': viewMode === 'list' }"
            title="List view"
            @click="viewMode = 'list'"
          >
            <List class="size-4" />
          </button>
          <button
            type="button"
            class="inline-flex h-full items-center gap-1.5 border-l border-white/10 px-3 text-sm font-medium transition-colors"
            :class="{ 'is-active': viewMode === 'table' }"
            title="Table view"
            @click="viewMode = 'table'"
          >
            <Table2 class="size-4" />
          </button>
        </div>

        <!-- Filters button -->
        <button
          type="button"
          class="factory-toolbar-button inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
          :class="{ 'is-active': activeFilterCount > 0 }"
          @click="drawerOpen = true"
        >
          <SlidersHorizontal class="size-4" />
          Filters
          <span
            v-if="activeFilterCount > 0"
            class="inline-flex items-center justify-center size-4 rounded-full bg-surface-700 dark:bg-surface-300 text-white dark:text-surface-900 text-xs font-semibold"
          >{{ activeFilterCount }}</span>
        </button>

        <!-- Clear filters -->
        <button
          v-if="activeFilterCount > 0"
          class="factory-toolbar-button inline-flex items-center gap-1 border px-2 py-2 text-xs transition-colors"
          @click="clearFilters"
        >
          <X class="size-3" />
          Clear
        </button>
      </div>

      <!-- ─── Filter Drawer ─── -->
      <FilterDrawer
        v-model="drawerOpen"
        title="Filter jobs"
        description="Customize your view, then save it for quick access."
        :active-count="activeFilterCount"
        saveable
        :default-save-name="`View ${views.length + 1}`"
        @reset="applySettings(defaultSettings)"
        @save-view="onSaveView"
      >
        <div class="space-y-6">
          <!-- Status -->
          <div class="factory-filter-section">
            <label class="factory-filter-label block mb-2">Status</label>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opt in statusOptions"
                :key="opt.value"
                type="button"
                class="factory-filter-chip px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer"
                :class="{ 'is-active': statusFilter.includes(opt.value) }"
                @click="toggleStatus(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Employment type -->
          <div class="factory-filter-section">
            <label class="factory-filter-label block mb-2">Employment type</label>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opt in typeOptions"
                :key="opt.value"
                type="button"
                class="factory-filter-chip px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer"
                :class="{ 'is-active': typeFilter.includes(opt.value) }"
                @click="toggleType(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Experience level -->
          <div class="factory-filter-section">
            <label class="factory-filter-label block mb-2">Experience level</label>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opt in experienceOptions"
                :key="opt.value"
                type="button"
                class="factory-filter-chip px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer"
                :class="{ 'is-active': experienceFilter.includes(opt.value) }"
                @click="toggleExperience(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Work arrangement -->
          <div class="factory-filter-section">
            <label class="factory-filter-label block mb-2">Work arrangement</label>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opt in remoteOptions"
                :key="opt.value"
                type="button"
                class="factory-filter-chip px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer"
                :class="{ 'is-active': remoteFilter.includes(opt.value) }"
                @click="toggleRemote(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Sort -->
          <div class="factory-filter-section">
            <label class="factory-filter-label block mb-2">Sort by</label>
            <div class="flex gap-2">
              <FactorySelect
                v-model="sortKey"
                aria-label="Sort field"
                class="flex-1"
                :options="sortKeyOptions"
              />

              <FactorySelect
                v-model="sortDir"
                aria-label="Sort direction"
                class="w-36"
                :options="sortDirOptions"
              />
            </div>
          </div>
        </div>
      </FilterDrawer>

      <!-- ─── No-results state ─── -->
      <div
        v-if="noResults"
        class="ui-empty-panel border-dashed"
      >
        <Search class="size-8 text-surface-300 dark:text-surface-600 mx-auto mb-3" />
        <p class="text-sm text-surface-600 dark:text-surface-300 mb-1">No jobs match your search</p>
        <p class="text-xs text-surface-400 dark:text-surface-500">Try a different keyword or clear your filters.</p>
      </div>

      <!-- ═══════════════════════════════════
           TABLE VIEW
      ════════════════════════════════════ -->
      <template v-else-if="viewMode === 'table'">
        <div class="ui-table-shell overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="ui-table-header">
                <th class="text-left px-4 py-3 font-medium text-surface-500 dark:text-surface-400">
                  <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('title')">
                    Title
                    <ArrowUp v-if="sortKey === 'title' && sortDir === 'asc'" class="size-3.5" />
                    <ArrowDown v-else-if="sortKey === 'title' && sortDir === 'desc'" class="size-3.5" />
                    <ArrowUpDown v-else class="size-3.5 opacity-40" />
                  </button>
                </th>
                <th class="text-left px-4 py-3 font-medium text-surface-500 dark:text-surface-400">
                  <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('status')">
                    Status
                    <ArrowUp v-if="sortKey === 'status' && sortDir === 'asc'" class="size-3.5" />
                    <ArrowDown v-else-if="sortKey === 'status' && sortDir === 'desc'" class="size-3.5" />
                    <ArrowUpDown v-else class="size-3.5 opacity-40" />
                  </button>
                </th>
                <th class="text-left px-4 py-3 font-medium text-surface-500 dark:text-surface-400 hidden sm:table-cell">
                  <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('type')">
                    Type
                    <ArrowUp v-if="sortKey === 'type' && sortDir === 'asc'" class="size-3.5" />
                    <ArrowDown v-else-if="sortKey === 'type' && sortDir === 'desc'" class="size-3.5" />
                    <ArrowUpDown v-else class="size-3.5 opacity-40" />
                  </button>
                </th>
                <th class="text-left px-4 py-3 font-medium text-surface-500 dark:text-surface-400 hidden md:table-cell">
                  <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('location')">
                    Location
                    <ArrowUp v-if="sortKey === 'location' && sortDir === 'asc'" class="size-3.5" />
                    <ArrowDown v-else-if="sortKey === 'location' && sortDir === 'desc'" class="size-3.5" />
                    <ArrowUpDown v-else class="size-3.5 opacity-40" />
                  </button>
                </th>
                <th class="text-center px-4 py-3 font-medium text-surface-500 dark:text-surface-400">
                  <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('new')">
                    New
                    <ArrowUp v-if="sortKey === 'new' && sortDir === 'asc'" class="size-3.5" />
                    <ArrowDown v-else-if="sortKey === 'new' && sortDir === 'desc'" class="size-3.5" />
                    <ArrowUpDown v-else class="size-3.5 opacity-40" />
                  </button>
                </th>
                <th class="text-center px-4 py-3 font-medium text-surface-500 dark:text-surface-400 hidden sm:table-cell">
                  <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('active')">
                    Active
                    <ArrowUp v-if="sortKey === 'active' && sortDir === 'asc'" class="size-3.5" />
                    <ArrowDown v-else-if="sortKey === 'active' && sortDir === 'desc'" class="size-3.5" />
                    <ArrowUpDown v-else class="size-3.5 opacity-40" />
                  </button>
                </th>
                <th class="text-left px-4 py-3 font-medium text-surface-500 dark:text-surface-400 hidden lg:table-cell">
                  <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('created')">
                    Created
                    <ArrowUp v-if="sortKey === 'created' && sortDir === 'asc'" class="size-3.5" />
                    <ArrowDown v-else-if="sortKey === 'created' && sortDir === 'desc'" class="size-3.5" />
                    <ArrowUpDown v-else class="size-3.5 opacity-40" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="j in sortedJobs"
                :key="j.id"
                class="ui-table-row group cursor-pointer"
                @click="$router.push(localePath(`/dashboard/jobs/${j.id}`))"
              >
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <NuxtLink
                      :to="localePath(`/dashboard/jobs/${j.id}`)"
                      class="font-semibold text-surface-900 dark:text-surface-100 group-hover:text-brand-600 transition-colors truncate max-w-[200px] no-underline"
                      @click.stop
                    >
                      {{ j.title }}
                    </NuxtLink>
                    <span
                      v-if="(j.pipeline?.new ?? 0) > 0"
                      class="factory-new-badge inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 shrink-0"
                    >
                      {{ j.pipeline.new }} new
                    </span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                    :class="getJobStatusBadgeClass(j.status)"
                  >
                    {{ j.status }}
                  </span>
                </td>
                <td class="px-4 py-3 text-surface-500 dark:text-surface-400 hidden sm:table-cell whitespace-nowrap">
                  {{ typeLabels[j.type] ?? j.type }}
                </td>
                <td class="px-4 py-3 text-surface-500 dark:text-surface-400 hidden md:table-cell">
                  <span v-if="j.location" class="inline-flex items-center gap-1">
                    <MapPin class="size-3 shrink-0" />
                    {{ j.location }}
                  </span>
                  <span v-else class="text-surface-300 dark:text-surface-600">—</span>
                </td>
                <td class="px-4 py-3 text-center">
                  <span
                    v-if="(j.pipeline?.new ?? 0) > 0"
                    class="inline-flex items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400 tabular-nums"
                  >
                    {{ j.pipeline.new }}
                  </span>
                  <span v-else class="text-surface-300 dark:text-surface-600">0</span>
                </td>
                <td class="px-4 py-3 text-center hidden sm:table-cell">
                  <span
                    v-if="totalActive(j.pipeline) > 0"
                    class="inline-flex items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-400 tabular-nums"
                  >
                    {{ totalActive(j.pipeline) }}
                  </span>
                  <span v-else class="text-surface-300 dark:text-surface-600">0</span>
                </td>
                <td class="px-4 py-3 text-surface-500 dark:text-surface-400 whitespace-nowrap hidden lg:table-cell">
                  {{ new Date(j.createdAt).toLocaleDateString() }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- ═══════════════════════════════════
           GALLERY VIEW (grid)
      ════════════════════════════════════ -->
      <template v-else-if="viewMode === 'gallery'">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="j in sortedJobs"
            :key="j.id"
            class="group rounded-xl border bg-white dark:bg-surface-900 p-4 flex flex-col gap-3 hover:shadow-md transition-all"
            :class="(j.pipeline?.new ?? 0) > 0
              ? 'border-warning-200 dark:border-warning-900/60 hover:border-warning-300 dark:hover:border-warning-800'
              : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'"
          >
            <!-- Card header: title + status -->
            <div class="flex items-start justify-between gap-2">
              <NuxtLink
                :to="localePath(`/dashboard/jobs/${j.id}`)"
                class="font-semibold text-sm text-surface-900 dark:text-surface-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors line-clamp-2 leading-snug no-underline"
              >
                {{ j.title }}
              </NuxtLink>
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 capitalize mt-0.5"
                :class="getJobStatusBadgeClass(j.status)"
              >
                {{ j.status }}
              </span>
            </div>

            <!-- Meta: type + location -->
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-400 dark:text-surface-500">
              <span>{{ typeLabels[j.type] ?? j.type }}</span>
              <span v-if="j.location" class="inline-flex items-center gap-1">
                <MapPin class="size-3 shrink-0" />
                {{ j.location }}
              </span>
            </div>

            <!-- Pipeline mini-stats -->
            <div class="factory-job-mini-pipeline grid grid-cols-3 gap-1.5 mt-auto">
              <NuxtLink
                v-for="stage in stageConfig"
                :key="stage.key"
                :to="localePath(`/dashboard/jobs/${j.id}?stage=${stage.key}`)"
                class="factory-job-stage-mini px-2 py-1.5 text-center transition-colors no-underline"
                :class="[
                  `factory-job-stage-mini-${stage.key}`,
                  getStageCount(j.pipeline, stage.key) > 0 ? 'is-active cursor-pointer' : 'is-empty',
                ]"
                @click.stop
              >
                <div class="factory-job-stage-mini-count text-xs font-semibold tabular-nums">
                  {{ getStageCount(j.pipeline, stage.key) }}
                </div>
                <div class="factory-job-stage-mini-label text-[10px] font-medium leading-tight">
                  {{ stage.label }}
                </div>
              </NuxtLink>
            </div>

            <!-- Attention bar -->
            <NuxtLink
              v-if="(j.pipeline?.new ?? 0) > 0"
              :to="localePath(`/dashboard/jobs/${j.id}?stage=new`)"
              class="factory-new-alert flex items-center justify-between gap-2 -mx-4 -mb-4 px-4 py-2 rounded-b-xl"
            >
              <span class="text-xs font-medium">
                {{ j.pipeline.new }} new application{{ j.pipeline.new === 1 ? '' : 's' }}
              </span>
              <span class="factory-new-alert-action inline-flex items-center gap-1 text-xs font-medium">
                <Kanban class="size-3" />
                Review
              </span>
            </NuxtLink>
          </div>
        </div>
      </template>

      <!-- ═══════════════════════════════════
           LIST VIEW
      ════════════════════════════════════ -->
      <template v-else-if="viewMode === 'list'">
        <!-- ─── Needs attention section ─── -->
        <div v-if="jobsNeedingAttention.length > 0" class="mb-8">
          <div class="flex items-center gap-2 mb-3 px-1">
            <Bell class="size-4 text-warning-500" />
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">
              Needs your attention
            </h2>
            <span class="text-xs text-surface-400 dark:text-surface-500">
              {{ jobsNeedingAttention.length }} job{{ jobsNeedingAttention.length === 1 ? '' : 's' }}
            </span>
          </div>

          <div class="space-y-3">
            <div
              v-for="j in jobsNeedingAttention"
              :key="j.id"
              class="group rounded-xl border bg-white dark:bg-surface-900 p-4 flex flex-col gap-3 hover:shadow-md transition-all"
              :class="(j.pipeline?.new ?? 0) > 0
                ? 'border-warning-200 dark:border-warning-900/60 hover:border-warning-300 dark:hover:border-warning-800'
                : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'"
            >
              <!-- Card header — job info -->
              <div class="flex items-start justify-between gap-2">
                <NuxtLink
                  :to="localePath(`/dashboard/jobs/${j.id}`)"
                  class="font-semibold text-sm text-surface-900 dark:text-surface-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors line-clamp-2 leading-snug no-underline"
                >
                  {{ j.title }}
                </NuxtLink>
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 capitalize mt-0.5"
                  :class="getJobStatusBadgeClass(j.status)"
                >
                  {{ j.status }}
                </span>
              </div>

              <!-- Meta: type + location -->
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-400 dark:text-surface-500">
                <span>{{ typeLabels[j.type] ?? j.type }}</span>
                <span v-if="j.location" class="inline-flex items-center gap-1">
                  <MapPin class="size-3 shrink-0" />
                  {{ j.location }}
                </span>
              </div>

              <!-- Pipeline mini-stats -->
              <div class="factory-job-mini-pipeline grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                <NuxtLink
                  v-for="stage in stageConfig"
                  :key="stage.key"
                  :to="localePath(`/dashboard/jobs/${j.id}?stage=${stage.key}`)"
                  class="factory-job-stage-mini px-2 py-1.5 text-center transition-colors no-underline"
                  :class="[
                    `factory-job-stage-mini-${stage.key}`,
                    getStageCount(j.pipeline, stage.key) > 0 ? 'is-active cursor-pointer' : 'is-empty',
                  ]"
                  @click.stop
                >
                  <div class="factory-job-stage-mini-count text-xs font-semibold tabular-nums">
                    {{ getStageCount(j.pipeline, stage.key) }}
                  </div>
                  <div class="factory-job-stage-mini-label text-[10px] font-medium leading-tight">
                    {{ stage.label }}
                  </div>
                </NuxtLink>
              </div>

              <!-- Action bar -->
              <div class="factory-new-alert -mx-4 -mb-4 flex items-center justify-between gap-2 px-4 py-2">
                <span class="text-xs font-medium mr-auto">
                  {{ j.pipeline.new }} new application{{ j.pipeline.new === 1 ? '' : 's' }} to review
                </span>
                <NuxtLink
                  :to="$localePath(`/dashboard/jobs/${j.id}`)"
                  class="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors no-underline"
                >
                  <Kanban class="size-3" />
                  Review in Pipeline
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>

        <!-- ─── All other jobs ─── -->
        <div>
          <div v-if="jobsNeedingAttention.length > 0" class="flex items-center gap-2 mb-3 px-1">
            <Briefcase class="size-4 text-surface-400" />
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">
              All jobs
            </h2>
            <span class="text-xs text-surface-400 dark:text-surface-500">
              {{ otherJobs.length }} job{{ otherJobs.length === 1 ? '' : 's' }}
            </span>
          </div>

          <div class="space-y-3">
            <div
              v-for="j in otherJobs"
              :key="j.id"
              class="group rounded-xl border border-surface-200 bg-white p-4 flex flex-col gap-3 hover:border-surface-300 hover:shadow-md transition-all dark:border-surface-800 dark:bg-surface-900 dark:hover:border-surface-700"
            >
              <!-- Job info -->
              <div class="flex items-start justify-between gap-2">
                <NuxtLink
                  :to="localePath(`/dashboard/jobs/${j.id}`)"
                  class="font-semibold text-sm text-surface-900 dark:text-surface-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors line-clamp-2 leading-snug no-underline"
                >
                  {{ j.title }}
                </NuxtLink>
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 capitalize mt-0.5"
                  :class="getJobStatusBadgeClass(j.status)"
                >
                  {{ j.status }}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-400 dark:text-surface-500">
                <span>{{ typeLabels[j.type] ?? j.type }}</span>
                <span v-if="j.location" class="inline-flex items-center gap-1">
                  <MapPin class="size-3 shrink-0" />
                  {{ j.location }}
                </span>
                <span v-if="j.status === 'draft'" class="text-surface-400 italic">
                  Not published yet
                </span>
              </div>

              <!-- Stage counts -->
              <div class="factory-job-mini-pipeline grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                <NuxtLink
                  v-for="stage in stageConfig"
                  :key="stage.key"
                  :to="localePath(`/dashboard/jobs/${j.id}?stage=${stage.key}`)"
                  class="factory-job-stage-mini px-2 py-1.5 text-center transition-colors no-underline"
                  :class="[
                    `factory-job-stage-mini-${stage.key}`,
                    getStageCount(j.pipeline, stage.key) > 0 ? 'is-active cursor-pointer' : 'is-empty',
                  ]"
                  @click.stop
                >
                  <div class="factory-job-stage-mini-count text-xs font-semibold tabular-nums">
                    {{ getStageCount(j.pipeline, stage.key) }}
                  </div>
                  <div class="factory-job-stage-mini-label text-[10px] font-medium leading-tight">
                    {{ stage.label }}
                  </div>
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Total count -->
      <p v-if="!noResults" class="text-xs text-surface-400 pt-4 px-1">
        <template v-if="search || activeFilterCount > 0">
          Showing {{ filteredJobs.length }} of {{ total }} job{{ total === 1 ? '' : 's' }}
        </template>
        <template v-else>
          {{ total }} job{{ total === 1 ? '' : 's' }} total
        </template>
      </p>
    </template>
  </div>
</template>
