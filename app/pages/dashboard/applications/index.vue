<script setup lang="ts">
import { FileText, Search, X, Briefcase, Mail, Clock, ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal, Maximize2, Minimize2, Check } from 'lucide-vue-next'
import {
  getApplicationStatusBadgeClass,
  getApplicationStatusDotClass,
  getApplicationStatusLabel,
  getScoreBadgeClass,
} from '~/utils/status-display'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

useSeoMeta({
  title: 'Applications — Factory Careers',
  description: 'Manage applications across all jobs',
})

// ── Column visibility ─────────────────────────────────────────────────────────

const COLUMNS_STORAGE_KEY = 'reqcore:columns:applications'

const defaultColumnVisibility = {
  email: true,
  job: true,
  status: true,
  score: true,
  applied: true,
}

const visibleColumns = ref<Record<string, boolean>>({ ...defaultColumnVisibility })

const { definitions: propertyDefs } = useProperties({ entityType: () => 'application' })

const applicationColumns = computed(() => [
  { key: 'candidate', label: 'Candidate', required: true },
  { key: 'email', label: 'Email' },
  { key: 'job', label: 'Job' },
  { key: 'status', label: 'Status' },
  { key: 'score', label: 'Score' },
  { key: 'applied', label: 'Applied' },
  ...propertyDefs.value.map((d) => ({ key: `prop_${d.id}`, label: d.name })),
])

onMounted(() => {
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY)
    if (raw) visibleColumns.value = { ...defaultColumnVisibility, ...JSON.parse(raw) }
  } catch {}
})

watch(visibleColumns, (val) => {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(val)) } catch {}
}, { deep: true })

const route = useRoute()
const router = useRouter()

// ── Search ────────────────────────────────────────────────────────────────────

const searchInput = ref('')
const debouncedSearch = ref('')

let debounceTimer: ReturnType<typeof setTimeout>
watch(searchInput, (val) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedSearch.value = val.trim().toLowerCase()
  }, 250)
})

// ── Status filter ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['new', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const
type Status = typeof STATUS_OPTIONS[number]

const initialAppStatus = STATUS_OPTIONS.includes(route.query.status as any)
  ? (route.query.status as Status)
  : undefined
const activeStatus = useState<Status | undefined>('app-filter-status', () => initialAppStatus)
// Ensure the state matches the URL on navigation (useState caches across client-side navigations)
if (initialAppStatus !== undefined) {
  activeStatus.value = initialAppStatus
}

// Sync the URL when the status filter changes
watch(activeStatus, (newStatus) => {
  const query = { ...route.query }
  if (newStatus) {
    query.status = newStatus
  }
  else {
    delete query.status
  }
  router.replace({ query })
})

const statusFilter = computed(() => activeStatus.value)
const propertyFilters = ref<import('~~/shared/properties').PropertyFilter[]>([])

const { applications, total, fetchStatus, error, refresh } = useApplications({
  status: statusFilter,
  propertyFilters,
})

const { formatPersonName } = useOrgSettings()

// ── Job filter (client-side) ──────────────────────────────────────────────────

const activeJobId = ref<string | undefined>(undefined)

const uniqueJobs = computed(() => {
  const apps = applications.value ?? []
  const map = new Map<string, string>()
  for (const app of apps) {
    if (!map.has(app.jobId)) map.set(app.jobId, app.jobTitle)
  }
  return Array.from(map, ([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title))
})

// ── Sorting ───────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'email' | 'job' | 'status' | 'score' | 'created'
type SortDir = 'asc' | 'desc'

const sortKey = ref<SortKey>('created')
const sortDir = ref<SortDir>('desc')

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = key === 'created' || key === 'score' ? 'desc' : 'asc'
  }
}

// ── Filtered + sorted list ────────────────────────────────────────────────────

const filteredApplications = computed(() => {
  let list = [...applications.value]

  // Job filter
  if (activeJobId.value) {
    list = list.filter(app => app.jobId === activeJobId.value)
  }

  // Search filter (client-side)
  if (debouncedSearch.value) {
    const q = debouncedSearch.value
    list = list.filter(app =>
      formatPersonName(app.candidateFirstName, app.candidateLastName).toLowerCase().includes(q)
      || `${app.candidateFirstName} ${app.candidateLastName}`.toLowerCase().includes(q)
      || app.candidateEmail.toLowerCase().includes(q)
      || app.jobTitle.toLowerCase().includes(q),
    )
  }

  // Sort
  const dir = sortDir.value === 'asc' ? 1 : -1
  list.sort((a, b) => {
    switch (sortKey.value) {
      case 'name':
        return dir * formatPersonName(a.candidateFirstName, a.candidateLastName).localeCompare(formatPersonName(b.candidateFirstName, b.candidateLastName))
      case 'email':
        return dir * a.candidateEmail.localeCompare(b.candidateEmail)
      case 'job':
        return dir * a.jobTitle.localeCompare(b.jobTitle)
      case 'status':
        return dir * a.status.localeCompare(b.status)
      case 'score':
        return dir * ((a.score ?? -1) - (b.score ?? -1))
      case 'created':
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      default:
        return 0
    }
  })

  return list
})

const hasActiveFilters = computed(() =>
  activeStatus.value != null || activeJobId.value != null || debouncedSearch.value.length > 0 || propertyFilters.value.length > 0,
)

function clearAllFilters() {
  activeStatus.value = undefined
  activeJobId.value = undefined
  searchInput.value = ''
  debouncedSearch.value = ''
  propertyFilters.value = []
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(date: string | Date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

// ── Drawer + Saved Views ──────────────────────────────────────────────────────

type ApplicationsViewSettings = {
  status?: Status
  jobId?: string
  propertyFilters: import('~~/shared/properties').PropertyFilter[]
  sortKey: SortKey
  sortDir: SortDir
  visibleColumns?: Record<string, boolean>
}

const defaultSettings: ApplicationsViewSettings = {
  status: undefined,
  jobId: undefined,
  propertyFilters: [],
  sortKey: 'created',
  sortDir: 'desc',
  visibleColumns: undefined,
}

const drawerOpen = ref(false)
const isFullscreen = ref(false)
const currentSettings = computed<ApplicationsViewSettings>(() => ({
  status: activeStatus.value,
  jobId: activeJobId.value,
  propertyFilters: [...propertyFilters.value],
  sortKey: sortKey.value,
  sortDir: sortDir.value,
  visibleColumns: { ...visibleColumns.value },
}))

function applySettings(s: ApplicationsViewSettings) {
  activeStatus.value = s.status
  activeJobId.value = s.jobId
  propertyFilters.value = [...(s.propertyFilters ?? [])]
  sortKey.value = s.sortKey
  sortDir.value = s.sortDir
  if (s.visibleColumns) visibleColumns.value = { ...defaultColumnVisibility, ...s.visibleColumns }
}

const {
  views,
  activeViewId,
  applyView,
  saveView,
  updateView,
  deleteView,
  setDefault,
  clearActive,
} = useSavedViews<ApplicationsViewSettings>('applications', defaultSettings)

// On first mount, if a default view exists, apply its settings.
onMounted(() => {
  nextTick(() => {
    if (activeViewId.value) {
      const s = applyView(activeViewId.value)
      if (s) applySettings(s)
    }
  })
})

function settingsEqual(a: ApplicationsViewSettings, b: ApplicationsViewSettings) {
  return a.status === b.status
    && a.jobId === b.jobId
    && a.sortKey === b.sortKey
    && a.sortDir === b.sortDir
    && JSON.stringify(a.propertyFilters ?? []) === JSON.stringify(b.propertyFilters ?? [])
    && JSON.stringify(a.visibleColumns ?? {}) === JSON.stringify(b.visibleColumns ?? {})
}

const isDirty = computed(() => {
  const view = views.value.find(v => v.id === activeViewId.value)
  if (!view) return false
  return !settingsEqual(currentSettings.value, { ...defaultSettings, ...view.settings })
})

// Mark the view inactive (chip-level highlight) when the user manually edits filters.
watch(currentSettings, () => {
  if (!activeViewId.value) return
  if (isDirty.value) {
    // Keep the chip active but show the dirty marker via SavedViewsBar.
  }
}, { deep: true })

function onSelectView(id: string | null) {
  if (id == null) {
    clearActive()
    applySettings(defaultSettings)
    return
  }
  const s = applyView(id)
  if (s) applySettings(s)
}

function onSaveView(name: string) {
  saveView(name, currentSettings.value)
}

function onUpdateView(id: string) {
  updateView(id, { settings: currentSettings.value })
}

const drawerActiveCount = computed(() =>
  [activeStatus.value, activeJobId.value].filter(Boolean).length + propertyFilters.value.length,
)

// ── Property value lookup helper ──────────────────────────────────────────────
function getPropertyValue(entity: { properties?: import('~~/shared/properties').PropertyEntry[] | null }, definitionId: string): unknown {
  return entity.properties?.find((p) => p.definition.id === definitionId)?.value ?? null
}

// ── Application detail drawer ─────────────────────────────────────────────────
const selectedApplicationId = ref<string | null>(null)
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">Applications</h1>
        <p class="text-sm text-white/60 mt-1">
          Track candidates through your hiring pipeline.
        </p>
      </div>
    </div>

    <!-- Search + Views + Filters -->
    <div class="flex items-center gap-2 mb-4">
      <div class="relative flex-1">
        <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-surface-400" />
        <input
          v-model="searchInput"
          type="text"
          placeholder="Search by candidate name, email, or job title…"
          class="w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 pl-10 pr-3 py-2 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
        />
      </div>
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
      <ColumnsMenu
        v-model="visibleColumns"
        :columns="applicationColumns"
      />
      <button
        type="button"
        class="factory-toolbar-button inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
        :class="{ 'is-active': drawerActiveCount > 0 }"
        @click="drawerOpen = true"
      >
        <SlidersHorizontal class="size-4" />
        <span>Filters</span>
        <span
          v-if="drawerActiveCount > 0"
          class="inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded-full bg-brand-500 text-white text-[10px] font-semibold"
        >{{ drawerActiveCount }}</span>
      </button>
      <button
        v-if="hasActiveFilters"
        class="inline-flex items-center gap-1 text-xs text-surface-400 hover:text-danger-600 transition-colors"
        @click="clearAllFilters"
      >
        <X class="size-3" />
        Clear
      </button>
      <button
        type="button"
        class="factory-toolbar-button inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors"
        :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen table'"
        @click="isFullscreen = !isFullscreen"
      >
        <Maximize2 v-if="!isFullscreen" class="size-4" />
        <Minimize2 v-else class="size-4" />
      </button>
    </div>

    <!-- Filter drawer -->
    <FilterDrawer
      v-model="drawerOpen"
      title="Filter applications"
      description="Customize your view, then save it for quick access."
      :active-count="drawerActiveCount"
      saveable
      :default-save-name="`View ${views.length + 1}`"
      @reset="applySettings(defaultSettings)"
      @save-view="onSaveView"
    >
      <div class="space-y-6">
        <!-- Status -->
        <div class="factory-filter-section">
          <label class="factory-filter-label mb-2 block">Status</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              class="factory-filter-chip px-3 py-1.5 text-xs"
              :class="{ 'is-active': !activeStatus }"
              @click="activeStatus = undefined"
            >Any</button>
            <button
              v-for="s in STATUS_OPTIONS"
              :key="s"
              type="button"
              class="factory-filter-chip px-3 py-1.5 text-xs"
              :class="{ 'is-active': activeStatus === s }"
              @click="activeStatus = activeStatus === s ? undefined : s"
            >{{ getApplicationStatusLabel(s) }}</button>
          </div>
        </div>

        <!-- Job -->
        <div class="factory-filter-section">
          <label class="factory-filter-label mb-2 block">Job</label>
          <FactorySelect
            v-model="activeJobId"
            :options="[
              { value: undefined, label: 'All jobs' },
              ...uniqueJobs.map(j => ({ value: j.id, label: j.title }))
            ]"
          />
        </div>

        <!-- Sort -->
        <div class="factory-filter-section">
          <label class="factory-filter-label mb-2 block">Sort by</label>
          <div class="flex gap-2">
            <FactorySelect
              v-model="sortKey"
              :options="[
                { value: 'created', label: 'Applied date' },
                { value: 'name', label: 'Candidate name' },
                { value: 'email', label: 'Email' },
                { value: 'job', label: 'Job title' },
                { value: 'status', label: 'Status' },
                { value: 'score', label: 'Score' },
              ]"
              class="flex-1"
            />
            <FactorySelect
              v-model="sortDir"
              :options="[
                { value: 'asc', label: 'Ascending' },
                { value: 'desc', label: 'Descending' },
              ]"
              class="w-32"
            />
          </div>
        </div>

        <!-- Property filters -->
        <div v-if="propertyDefs.length > 0" class="factory-filter-section">
          <label class="factory-filter-label mb-2 block">Properties</label>
          <PropertyFilterBar v-model="propertyFilters" entity-type="application" />
        </div>


      </div>
    </FilterDrawer>

    <!-- Loading -->
    <div v-if="fetchStatus === 'pending'" class="text-center py-16 text-surface-400">
      Loading applications…
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700"
    >
      Failed to load applications. Please try again.
      <button class="underline ml-1" @click="refresh()">Retry</button>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="applications.length === 0"
      class="ui-empty-panel"
    >
      <FileText class="size-10 text-surface-300 dark:text-surface-600 mx-auto mb-3" />
      <h3 class="text-base font-semibold text-surface-700 dark:text-surface-200 mb-1">No applications yet</h3>
      <p class="text-sm text-white/60">
        Applications will appear here when candidates apply to your jobs or when you manually link candidates.
      </p>
    </div>

    <!-- No results after filtering -->
    <div
      v-else-if="filteredApplications.length === 0"
      class="ui-empty-panel"
    >
      <Search class="size-8 text-surface-300 dark:text-surface-600 mx-auto mb-3" />
      <h3 class="text-base font-semibold text-surface-700 dark:text-surface-200 mb-1">No matching applications</h3>
      <p class="text-sm text-white/60 mb-3">
        Try adjusting your search or filters.
      </p>
      <button
        class="ui-button ui-button-secondary"
        @click="clearAllFilters"
      >
        Clear all filters
      </button>
    </div>

    <!-- Application table -->
    <div v-else>
      <Teleport to="body" :disabled="!isFullscreen">
        <div :class="isFullscreen ? 'fixed inset-0 z-50 bg-black text-white flex flex-col factory-dashboard-portal' : ''">
          <!-- Fullscreen header -->
          <div v-if="isFullscreen" class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0 bg-white/[0.02]">
            <span class="text-sm font-semibold text-white">
              Applications — {{ filteredApplications.length }} result{{ filteredApplications.length === 1 ? '' : 's' }}
            </span>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors"
              @click="isFullscreen = false"
            >
              <Minimize2 class="size-4" />
              Exit fullscreen
            </button>
          </div>
          <div :class="isFullscreen ? 'flex-1 overflow-auto p-4' : ''">
            <div class="ui-table-shell overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="ui-table-header">
              <th class="text-left px-4 py-3 font-medium text-white/60">
                <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('name')">
                  Candidate
                  <ArrowUp v-if="sortKey === 'name' && sortDir === 'asc'" class="size-3.5" />
                  <ArrowDown v-else-if="sortKey === 'name' && sortDir === 'desc'" class="size-3.5" />
                  <ArrowUpDown v-else class="size-3.5 opacity-40" />
                </button>
              </th>
              <th v-if="visibleColumns.email" class="text-left px-4 py-3 font-medium text-white/60 hidden lg:table-cell">
                <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('email')">
                  Email
                  <ArrowUp v-if="sortKey === 'email' && sortDir === 'asc'" class="size-3.5" />
                  <ArrowDown v-else-if="sortKey === 'email' && sortDir === 'desc'" class="size-3.5" />
                  <ArrowUpDown v-else class="size-3.5 opacity-40" />
                </button>
              </th>
              <th v-if="visibleColumns.job" class="text-left px-4 py-3 font-medium text-white/60 hidden md:table-cell">
                <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('job')">
                  Job
                  <ArrowUp v-if="sortKey === 'job' && sortDir === 'asc'" class="size-3.5" />
                  <ArrowDown v-else-if="sortKey === 'job' && sortDir === 'desc'" class="size-3.5" />
                  <ArrowUpDown v-else class="size-3.5 opacity-40" />
                </button>
              </th>
              <th v-if="visibleColumns.status" class="text-left px-4 py-3 font-medium text-white/60">
                <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('status')">
                  Status
                  <ArrowUp v-if="sortKey === 'status' && sortDir === 'asc'" class="size-3.5" />
                  <ArrowDown v-else-if="sortKey === 'status' && sortDir === 'desc'" class="size-3.5" />
                  <ArrowUpDown v-else class="size-3.5 opacity-40" />
                </button>
              </th>
              <th v-if="visibleColumns.score" class="text-center px-4 py-3 font-medium text-white/60 hidden sm:table-cell">
                <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('score')">
                  Score
                  <ArrowUp v-if="sortKey === 'score' && sortDir === 'asc'" class="size-3.5" />
                  <ArrowDown v-else-if="sortKey === 'score' && sortDir === 'desc'" class="size-3.5" />
                  <ArrowUpDown v-else class="size-3.5 opacity-40" />
                </button>
              </th>
              <th v-if="visibleColumns.applied" class="text-left px-4 py-3 font-medium text-white/60">
                <button class="inline-flex items-center gap-1 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="toggleSort('created')">
                  Applied
                  <ArrowUp v-if="sortKey === 'created' && sortDir === 'asc'" class="size-3.5" />
                  <ArrowDown v-else-if="sortKey === 'created' && sortDir === 'desc'" class="size-3.5" />
                  <ArrowUpDown v-else class="size-3.5 opacity-40" />
                </button>
              </th>
              <template v-for="d in propertyDefs" :key="d.id">
                <th v-if="visibleColumns[`prop_${d.id}`]" class="text-left px-4 py-3 font-medium text-white/60 whitespace-nowrap">
                  {{ d.name }}
                </th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="app in filteredApplications"
              :key="app.id"
              class="ui-table-row group cursor-pointer [&>td]:align-top"
              @click="selectedApplicationId = app.id"
            >
              <td class="px-4 py-3">
                <button
                  type="button"
                  class="font-semibold text-surface-900 dark:text-surface-100 group-hover:text-brand-600 transition-colors whitespace-nowrap text-left"
                  @click.stop="selectedApplicationId = app.id"
                >
                  {{ formatPersonName(app.candidateFirstName, app.candidateLastName) }}
                </button>
              </td>
              <td v-if="visibleColumns.email" class="px-4 py-3 text-white/60 hidden lg:table-cell">
                <span class="inline-flex items-center gap-1.5">
                  <Mail class="size-3.5 shrink-0" />
                  <span class="truncate max-w-[200px]">{{ app.candidateEmail }}</span>
                </span>
              </td>
              <td v-if="visibleColumns.job" class="px-4 py-3 text-white/70 hidden md:table-cell">
                <span class="inline-flex items-center gap-1.5 truncate max-w-[200px]">
                  <Briefcase class="size-3.5 shrink-0 text-surface-400" />
                  {{ app.jobTitle }}
                </span>
              </td>
              <td v-if="visibleColumns.status" class="px-4 py-3">
                <span
                  class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset"
                  :class="getApplicationStatusBadgeClass(app.status, 'ring')"
                >
                  <span class="size-1.5 rounded-full" :class="getApplicationStatusDotClass(app.status)" />
                  {{ getApplicationStatusLabel(app.status) }}
                </span>
              </td>
              <td v-if="visibleColumns.score" class="px-4 py-3 text-center hidden sm:table-cell">
                <span
                  v-if="app.score != null"
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset"
                  :class="getScoreBadgeClass(app.score, 'soft')"
                >
                  {{ app.score }}%
                </span>
                <span v-else class="text-surface-300 dark:text-surface-600">—</span>
              </td>
              <td v-if="visibleColumns.applied" class="px-4 py-3 text-white/60 whitespace-nowrap">
                <TimelineDateLink :date="app.createdAt" class="inline-flex items-center gap-1.5">
                  <Clock class="size-3.5 shrink-0" />
                  {{ timeAgo(app.createdAt) }}
                </TimelineDateLink>
              </td>
              <!-- Property columns -->
              <template v-for="d in propertyDefs" :key="d.id">
                <td v-if="visibleColumns[`prop_${d.id}`]" class="px-4 py-3 text-white/60 align-top">
                  <PropertyTableCell
                    entity-type="application"
                    :entity-id="app.id"
                    :definition="d"
                    :value="getPropertyValue(app, d.id)"
                  />
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer count -->
      <p class="text-xs text-surface-400 pt-3">
        Showing {{ filteredApplications.length }} of {{ total }} application{{ total === 1 ? '' : 's' }}
      </p>
          </div>
        </div>
      </Teleport>
    </div>
  </div>

  <!-- Application detail drawer -->
  <ApplicationDetailDrawer
    v-if="selectedApplicationId"
    :application-id="selectedApplicationId"
    @close="selectedApplicationId = null"
  />
</template>
