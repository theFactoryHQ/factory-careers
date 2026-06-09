<script setup lang="ts">
import { dashboardListPageKeepalive } from '~~/shared/dashboard-keepalive'
import { FileText, Search, Briefcase, Clock, ArrowUp, ArrowDown, ArrowUpDown, Minimize2 } from 'lucide-vue-next'
import type { SortDir } from '~/composables/useTableSort'
import {
  formatRelativeTime,
  getApplicationStatusLabel,
  getScoreBadgeClass,
} from '~/utils/status-display'
import { getPropertyValue } from '~/utils/property-display'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
  keepalive: dashboardListPageKeepalive,
})

useSeoMeta({
  title: 'Applications — Factory Careers',
  description: 'Manage applications across all jobs',
})

// ── Column visibility ─────────────────────────────────────────────────────────

const defaultColumnVisibility = {
  email: true,
  job: true,
  status: true,
  score: true,
  applied: true,
}

const { visibleColumns, mergeColumnVisibility } = useColumnVisibility('applications', defaultColumnVisibility)

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

const route = useRoute()
const router = useRouter()

// ── Search ────────────────────────────────────────────────────────────────────

const {
  searchInput,
  debouncedSearch,
  drawerOpen,
  isFullscreen,
} = useDashboardListPage<string>({
  debounceMs: 250,
  normalizeSearch: (value) => value.trim().toLowerCase(),
  initialSearch: '',
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

const { data, applications, total, fetchStatus, error, refresh } = useApplications({
  status: statusFilter,
  propertyFilters,
})

const { showSkeleton, isRevalidating } = useStaleFetchUi(fetchStatus, data)

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

const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>({
  initialKey: 'created',
  initialDir: 'desc',
  defaultDirForKey: (key) => (key === 'created' || key === 'score' ? 'desc' : 'asc'),
})

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
  if (s.visibleColumns) mergeColumnVisibility(s.visibleColumns)
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
} = useSavedViewState<ApplicationsViewSettings>('applications', defaultSettings, currentSettings, applySettings)

const drawerActiveCount = computed(() =>
  [activeStatus.value, activeJobId.value].filter(Boolean).length + propertyFilters.value.length,
)

// ── Application detail drawer ─────────────────────────────────────────────────
const selectedApplicationId = ref<string | null>(null)
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <StaleRevalidateBar v-if="isRevalidating" />

    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">Applications</h1>
        <p class="text-sm text-white/60 mt-1">
          Track candidates through your hiring pipeline.
        </p>
      </div>
    </div>

    <DashboardListToolbar
      v-model:search-input="searchInput"
      v-model:visible-columns="visibleColumns"
      search-aria-label="Search applications"
      search-placeholder="Search by candidate name, email, or job title…"
      :views="views"
      :active-view-id="activeViewId"
      :is-dirty="isDirty"
      :columns="applicationColumns"
      :filter-count="drawerActiveCount"
      :show-clear="hasActiveFilters"
      :is-fullscreen="isFullscreen"
      clear-button-class="inline-flex items-center gap-1 text-xs text-surface-400 hover:text-danger-600 transition-colors"
      @open-filters="drawerOpen = true"
      @clear-filters="clearAllFilters"
      @toggle-fullscreen="isFullscreen = !isFullscreen"
      @select-view="onSelectView"
      @save-view="onSaveView"
      @update-view="onUpdateView"
      @delete-view="deleteView"
      @set-default-view="setDefault"
    />

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
    <div v-if="showSkeleton" class="text-center py-16 text-surface-400">
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
        <div :class="isFullscreen ? 'factory-fullscreen-surface fixed inset-0 z-50 flex flex-col factory-dashboard-portal' : ''">
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
                <CopyEmailButton :email="app.candidateEmail" class="max-w-[200px] text-white/60" />
              </td>
              <td v-if="visibleColumns.job" class="px-4 py-3 text-white/70 hidden md:table-cell">
                <span class="inline-flex items-center gap-1.5 truncate max-w-[200px]">
                  <Briefcase class="size-3.5 shrink-0 text-surface-400" />
                  {{ app.jobTitle }}
                </span>
              </td>
              <td v-if="visibleColumns.status" class="px-4 py-3">
                <ApplicationStatusBadge :status="app.status" />
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
                  {{ formatRelativeTime(app.createdAt) }}
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
