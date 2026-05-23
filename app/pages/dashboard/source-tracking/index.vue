<script setup lang="ts">
import {
  Radio, ArrowRight, TrendingUp, Link2, Globe,
  BarChart3, Users, ExternalLink, Plus, AlertCircle,
  Activity, Target, Eye, MousePointerClick,
  CheckCircle2, XCircle, Clock, Filter,
  Copy, ToggleLeft, ToggleRight,
  Trash2, ChevronDown, ChevronUp, X,
} from 'lucide-vue-next'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

useSeoMeta({
  title: 'Source Tracking — Factory Careers',
  description: 'Track where your applications come from',
})

const localePath = useLocalePath()
const { track } = useTrack()
const toast = useToast()
const { formatPersonName } = useOrgSettings()

onMounted(() => track('source_tracking_viewed'))

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

const route = useRoute()

// Initialize filters from query params (e.g. ?jobId=xxx&tab=links)
const selectedJobId = ref<string | undefined>(route.query.jobId as string | undefined)
const selectedChannel = ref<string | undefined>()
const dateRange = ref<'7d' | '30d' | '90d' | 'all'>('30d')

const dateFrom = computed(() => {
  if (dateRange.value === 'all') return undefined
  const d = new Date()
  const days = { '7d': 7, '30d': 30, '90d': 90 }[dateRange.value]
  d.setDate(d.getDate() - days)
  return d.toISOString()
})

// ─────────────────────────────────────────────
// Fetch data
// ─────────────────────────────────────────────

const {
  channelBreakdown,
  topLinks,
  funnel,
  dailyTrend,
  recentAttributed,
  topReferrerDomains,
  summary,
  statsStatus,
  statsError,
  refreshStats,
} = useSourceTracking({
  jobId: selectedJobId,
  from: dateFrom,
})

const {
  links,
  total: totalLinks,
  fetchStatus: linksStatus,
  createLink,
  updateLink,
  deleteLink,
  toggleLink,
  refresh: refreshLinks,
} = useTrackingLinks()

// Fetch jobs for filter dropdown
const { data: jobsData } = useFetch('/api/jobs', {
  key: 'source-tracking-jobs',
  headers: useRequestHeaders(['cookie']),
  query: { limit: 100 },
})
const jobs = computed(() => (jobsData.value as any)?.data ?? [])

const { allowed: canManageLinks } = usePermission({ sourceTracking: ['create'] })

// ─────────────────────────────────────────────
// Create link modal
// ─────────────────────────────────────────────

const showCreateModal = ref(false)
const isCreating = ref(false)
const newLink = ref({
  name: '',
  channel: 'custom' as string,
  jobId: '' as string,
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
})

async function handleCreateLink() {
  if (!newLink.value.name.trim()) return
  isCreating.value = true
  try {
    await createLink({
      name: newLink.value.name.trim(),
      channel: newLink.value.channel as any,
      jobId: newLink.value.jobId || undefined,
      utmSource: newLink.value.utmSource || undefined,
      utmMedium: newLink.value.utmMedium || undefined,
      utmCampaign: newLink.value.utmCampaign || undefined,
    })
    showCreateModal.value = false
    newLink.value = { name: '', channel: 'custom', jobId: '', utmSource: '', utmMedium: '', utmCampaign: '' }
    await refreshStats()
  } catch (err: any) {
    toast.error(err?.data?.statusMessage ?? 'Failed to create link')
  } finally {
    isCreating.value = false
  }
}

// ─────────────────────────────────────────────
// Delete confirmation
// ─────────────────────────────────────────────

const deletingId = ref<string | null>(null)
const showDeleteConfirm = ref(false)

function confirmDelete(id: string) {
  deletingId.value = id
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!deletingId.value) return
  try {
    await deleteLink(deletingId.value)
    await refreshStats()
  } catch (err: any) {
    toast.error(err?.data?.statusMessage ?? 'Failed to delete')
  } finally {
    showDeleteConfirm.value = false
    deletingId.value = null
  }
}

// ─────────────────────────────────────────────
// Link URL builder
// ─────────────────────────────────────────────

const requestUrl = useRequestURL()
function buildTrackingUrl(code: string): string {
  const base = `${requestUrl.protocol}//${requestUrl.host}`
  return `${base}/api/public/track/${encodeURIComponent(code)}`
}

const copiedCode = ref<string | null>(null)
async function copyTrackingUrl(code: string) {
  try {
    await navigator.clipboard.writeText(buildTrackingUrl(code))
    copiedCode.value = code
    setTimeout(() => { copiedCode.value = null }, 2000)
  } catch {
    toast.info(buildTrackingUrl(code))
  }
}

// ─────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────



const totalApplications = computed(() =>
  channelBreakdown.value.reduce((sum, c) => sum + c.count, 0),
)

const maxChannelCount = computed(() =>
  Math.max(...channelBreakdown.value.map((c) => c.count), 1),
)

function conversionRate(channel: string): number {
  const f = funnel.value[channel]
  if (!f) return 0
  const total = Object.values(f).reduce((s, v) => s + v, 0)
  if (total === 0) return 0
  const hired = f.hired ?? 0
  return Math.round((hired / total) * 100)
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const filteredAttributed = computed(() => {
  if (!selectedChannel.value) return recentAttributed.value
  return recentAttributed.value.filter(a => a.channel === selectedChannel.value)
})

// ─────────────────────────────────────────────
// Tracking links table sorting
// ─────────────────────────────────────────────

type LinkSortKey = 'name' | 'channel' | 'clickCount' | 'applicationCount' | 'cvr' | 'isActive'
const linkSortKey = ref<LinkSortKey>('clickCount')
const linkSortAsc = ref(false)

function toggleLinkSort(key: LinkSortKey) {
  if (linkSortKey.value === key) {
    linkSortAsc.value = !linkSortAsc.value
  } else {
    linkSortKey.value = key
    linkSortAsc.value = key === 'name' || key === 'channel' // default asc for text columns
  }
}

function getLinkCvr(link: { clickCount: number; applicationCount: number }) {
  return link.clickCount > 0 ? link.applicationCount / link.clickCount : 0
}

const sortedLinks = computed(() => {
  const sorted = [...links.value].sort((a, b) => {
    let cmp = 0
    switch (linkSortKey.value) {
      case 'name':
        cmp = a.name.localeCompare(b.name)
        break
      case 'channel':
        cmp = a.channel.localeCompare(b.channel)
        break
      case 'clickCount':
        cmp = a.clickCount - b.clickCount
        break
      case 'applicationCount':
        cmp = a.applicationCount - b.applicationCount
        break
      case 'cvr':
        cmp = getLinkCvr(a) - getLinkCvr(b)
        break
      case 'isActive':
        cmp = Number(a.isActive) - Number(b.isActive)
        break
    }
    return linkSortAsc.value ? cmp : -cmp
  })
  return sorted
})

const initialTab = (['overview', 'links', 'table'] as const).includes(route.query.tab as any)
  ? (route.query.tab as 'overview' | 'links' | 'table')
  : 'overview'
const showTab = ref<'overview' | 'links' | 'table'>(initialTab)
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <!-- ─── Loading skeleton ─── -->
    <div v-if="statsStatus === 'pending'">
      <div class="mb-10">
        <div class="h-8 w-56 bg-surface-200 dark:bg-surface-700 rounded-lg animate-pulse mb-2" />
        <div class="h-4 w-72 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div v-for="i in 4" :key="i" class="ui-dashboard-stat-card p-6 animate-pulse">
          <div class="h-4 w-20 bg-surface-200 dark:bg-surface-700 rounded mb-4" />
          <div class="h-9 w-14 bg-surface-200 dark:bg-surface-700 rounded" />
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="ui-panel ui-dashboard-panel lg:col-span-2 p-6 animate-pulse">
          <div class="h-5 w-32 bg-surface-200 dark:bg-surface-700 rounded mb-6" />
          <div class="space-y-4">
            <div v-for="i in 5" :key="i" class="h-10 bg-surface-100 dark:bg-surface-800 rounded-xl" />
          </div>
        </div>
        <div class="ui-panel ui-dashboard-panel p-6 animate-pulse">
          <div class="h-5 w-32 bg-surface-200 dark:bg-surface-700 rounded mb-6" />
          <div class="space-y-3">
            <div v-for="i in 4" :key="i" class="h-14 bg-surface-100 dark:bg-surface-800 rounded-xl" />
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Error ─── -->
    <div
      v-else-if="statsError"
      class="ui-alert ui-alert-danger flex items-center gap-3 p-5"
    >
      <AlertCircle class="size-5 shrink-0" />
      <span>Failed to load source tracking data.</span>
      <button class="underline ml-auto font-medium cursor-pointer" @click="refreshStats()">Retry</button>
    </div>

    <!-- ─── Main content ─── -->
    <template v-else>
      <!-- ─── Header ─── -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-10">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold text-surface-900 dark:text-surface-50 tracking-tight">Source Tracking</h1>
          <p class="text-sm text-surface-400 dark:text-surface-500 mt-1">
            Track where your applications come from
          </p>
        </div>
        <div class="flex items-center gap-2">
          <!-- Date range pill -->
          <div class="ui-panel inline-flex rounded-xl p-0.5">
            <button
              v-for="range in (['7d', '30d', '90d', 'all'] as const)"
              :key="range"
              class="ui-filter-chip px-3 py-1.5 text-xs font-medium transition-all"
              :class="dateRange === range ? 'ui-filter-chip-active' : 'ui-filter-chip-inactive'"
              @click="dateRange = range"
            >
              {{ range === 'all' ? 'All time' : range.toUpperCase() }}
            </button>
          </div>

          <!-- Job filter -->
          <FactorySelect
            v-model="selectedJobId"
            :options="[
              { value: undefined, label: 'All jobs' },
              ...jobs.map((j: { id: string; title: string }) => ({ value: j.id, label: j.title }))
            ]"
          />

          <!-- Create link button -->
          <button
            v-if="canManageLinks"
            class="ui-button ui-button-primary px-4 py-2 text-xs sm:text-sm font-semibold shadow-sm shadow-brand-600/15 hover:shadow-md hover:shadow-brand-600/20"
            @click="showCreateModal = true"
          >
            <Plus class="size-4" />
            <span class="hidden sm:inline">New Link</span>
          </button>
        </div>
      </div>

      <!-- ─── Tab navigation ─── -->
      <div class="flex items-center gap-1 mb-6 border-b border-surface-200 dark:border-surface-800">
        <button
          v-for="tab in [
            { key: 'overview', label: 'Overview', icon: BarChart3 },
            { key: 'links', label: 'Tracking Links', icon: Link2 },
            { key: 'table', label: 'Attribution Log', icon: Users },
          ] as const"
          :key="tab.key"
          class="ui-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium -mb-px transition-colors"
          :class="showTab === tab.key ? 'ui-tab-active' : 'ui-tab-inactive'"
          @click="showTab = tab.key; if (tab.key !== 'table') selectedChannel = undefined"
        >
          <component :is="tab.icon" class="size-4" />
          {{ tab.label }}
          <span
            v-if="tab.key === 'links'"
            class="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums"
            :class="showTab === 'links'
              ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400'
              : 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400'"
          >
            {{ totalLinks }}
          </span>
        </button>
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- TAB: Overview                           -->
      <!-- ═══════════════════════════════════════ -->
      <div v-if="showTab === 'overview'">
        <!-- ─── Stat cards ─── -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-10">
          <!-- Tracked Applications -->
          <div class="group ui-dashboard-stat-card p-5 sm:p-6 ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-brand-500/25 dark:hover:ring-brand-400/25 hover:shadow-lg hover:shadow-brand-500/[0.08]">
            <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Target class="absolute -bottom-3 -right-3 size-24 text-brand-500/[0.03] dark:text-brand-400/[0.05] rotate-12 transition-transform duration-700 ease-out group-hover:rotate-3 group-hover:scale-110 pointer-events-none" />
            <div class="relative">
              <div class="flex items-baseline gap-2">
                <span class="text-3xl sm:text-4xl font-black tracking-tight text-surface-900 dark:text-surface-50 tabular-nums leading-none transition-colors duration-300 group-hover:text-brand-600 dark:group-hover:text-brand-400">
                  {{ summary.totalTracked }}
                </span>
                <span class="size-1.5 rounded-full bg-brand-500 shrink-0 mb-1" />
              </div>
              <span class="block mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-400 dark:text-surface-500">Tracked</span>
              <p class="text-[11px] text-surface-300 dark:text-surface-600 mt-1">With source attribution</p>
            </div>
          </div>

          <!-- Attribution Rate -->
          <div class="group ui-dashboard-stat-card p-5 sm:p-6 ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-teal-500/25 dark:hover:ring-teal-400/25 hover:shadow-lg hover:shadow-teal-500/[0.08]">
            <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Activity class="absolute -bottom-3 -right-3 size-24 text-teal-500/[0.03] dark:text-teal-400/[0.05] rotate-12 transition-transform duration-700 ease-out group-hover:rotate-3 group-hover:scale-110 pointer-events-none" />
            <div class="relative">
              <div class="flex items-baseline gap-2">
                <span class="text-3xl sm:text-4xl font-black tracking-tight text-surface-900 dark:text-surface-50 tabular-nums leading-none transition-colors duration-300 group-hover:text-teal-600 dark:group-hover:text-teal-400">
                  {{ summary.attributionRate }}%
                </span>
                <span class="size-1.5 rounded-full bg-teal-500 shrink-0 mb-1" />
              </div>
              <span class="block mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-400 dark:text-surface-500">Attribution</span>
              <p class="text-[11px] text-surface-300 dark:text-surface-600 mt-1">Of all applications</p>
            </div>
          </div>

          <!-- Active Links -->
          <div class="group ui-dashboard-stat-card p-5 sm:p-6 ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-violet-500/25 dark:hover:ring-violet-400/25 hover:shadow-lg hover:shadow-violet-500/[0.08]">
            <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Link2 class="absolute -bottom-3 -right-3 size-24 text-violet-500/[0.03] dark:text-violet-400/[0.05] rotate-12 transition-transform duration-700 ease-out group-hover:rotate-3 group-hover:scale-110 pointer-events-none" />
            <div class="relative">
              <div class="flex items-baseline gap-2">
                <span class="text-3xl sm:text-4xl font-black tracking-tight text-surface-900 dark:text-surface-50 tabular-nums leading-none transition-colors duration-300 group-hover:text-violet-600 dark:group-hover:text-violet-400">
                  {{ links.filter(l => l.isActive).length }}
                </span>
                <span class="size-1.5 rounded-full bg-violet-500 shrink-0 mb-1" />
              </div>
              <span class="block mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-400 dark:text-surface-500">Active Links</span>
              <p class="text-[11px] text-surface-300 dark:text-surface-600 mt-1">{{ totalLinks }} total created</p>
            </div>
          </div>

          <!-- Untracked -->
          <div
            class="group ui-dashboard-stat-card p-5 sm:p-6"
            :class="summary.totalUntracked > 0
              ? 'ring-1 ring-warning-400/30 dark:ring-warning-500/20 hover:ring-warning-500/40 dark:hover:ring-warning-400/30 shadow-sm shadow-warning-500/[0.06] hover:shadow-lg hover:shadow-warning-500/[0.12]'
              : 'ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-surface-300/50 dark:hover:ring-surface-600/30 hover:shadow-lg hover:shadow-surface-500/[0.04]'"
          >
            <div
              class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent transition-opacity duration-500"
              :class="summary.totalUntracked > 0
                ? 'via-warning-500 opacity-60 group-hover:opacity-100'
                : 'via-surface-400 opacity-0 group-hover:opacity-40'"
            />
            <Eye class="absolute -bottom-3 -right-3 size-24 rotate-12 transition-transform duration-700 ease-out group-hover:rotate-3 group-hover:scale-110 pointer-events-none" :class="summary.totalUntracked > 0 ? 'text-warning-500/[0.04] dark:text-warning-400/[0.06]' : 'text-surface-400/[0.03] dark:text-surface-500/[0.05]'" />
            <div class="relative">
              <div class="flex items-baseline gap-2">
                <span
                  class="text-3xl sm:text-4xl font-black tracking-tight tabular-nums leading-none transition-colors duration-300"
                  :class="summary.totalUntracked > 0
                    ? 'text-warning-600 dark:text-warning-400 group-hover:text-warning-700 dark:group-hover:text-warning-300'
                    : 'text-surface-900 dark:text-surface-50 group-hover:text-surface-600 dark:group-hover:text-surface-300'"
                >
                  {{ summary.totalUntracked }}
                </span>
                <span class="relative shrink-0 mb-1">
                  <span class="size-1.5 rounded-full block" :class="summary.totalUntracked > 0 ? 'bg-warning-500' : 'bg-surface-300 dark:bg-surface-600'" />
                  <span v-if="summary.totalUntracked > 0" class="absolute inset-0 size-1.5 rounded-full bg-warning-500 animate-ping" />
                </span>
              </div>
              <span class="block mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-400 dark:text-surface-500">Untracked</span>
              <p class="text-[11px] mt-1" :class="summary.totalUntracked > 0 ? 'text-warning-500 dark:text-warning-500 font-medium' : 'text-surface-300 dark:text-surface-600'">
                {{ summary.totalUntracked > 0 ? 'Without attribution' : 'All attributed' }}
              </p>
            </div>
          </div>
        </div>

        <!-- ─── Main layout ─── -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- ─── Left (2/3): Channel breakdown ─── -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Channel breakdown -->
            <div class="ui-panel ui-dashboard-panel shadow-xs dark:shadow-none">
              <div class="ui-panel-header ui-dashboard-panel-header flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <div class="ui-dashboard-soft-icon flex items-center justify-center size-7 rounded-lg">
                    <BarChart3 class="size-3.5 text-surface-500 dark:text-surface-400" />
                  </div>
                  <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Applications by Source</h2>
                </div>
                <span class="text-xs text-surface-400 tabular-nums font-medium">{{ totalApplications }} total</span>
              </div>

              <div v-if="channelBreakdown.length === 0" class="px-6 py-12 text-center">
                <div class="mx-auto mb-4 flex items-center justify-center size-12 rounded-2xl bg-surface-100 dark:bg-surface-800">
                  <BarChart3 class="size-5 text-surface-400 dark:text-surface-500" />
                </div>
                <p class="text-sm font-medium text-surface-500 dark:text-surface-400 mb-1">No attributed applications yet</p>
                <p class="text-xs text-surface-400 dark:text-surface-500 max-w-xs mx-auto">
                  Create tracking links and share them on job boards to start collecting source data.
                </p>
              </div>

              <div v-else class="px-6 py-5 space-y-4">
                <button
                  v-for="item in channelBreakdown"
                  :key="item.channel"
                  class="group/bar w-full text-left cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/40 -mx-3 px-3 py-1.5 rounded-lg transition-colors"
                  @click="selectedChannel = item.channel; showTab = 'table'"
                >
                  <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center gap-2">
                      <div class="size-2.5 rounded-full" :class="getSourceChannelDotClass(item.channel)" />
                      <span class="text-sm font-medium text-surface-700 dark:text-surface-200">
                        {{ getSourceChannelLabel(item.channel) }}
                      </span>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="text-xs text-surface-400 tabular-nums">
                        {{ totalApplications > 0 ? Math.round((item.count / totalApplications) * 100) : 0 }}%
                      </span>
                      <span class="text-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums w-8 text-right">
                        {{ item.count }}
                      </span>
                    </div>
                  </div>
                  <div class="ui-meter-track h-2 rounded-full overflow-hidden">
                    <div
                      class="ui-meter-fill h-full rounded-full transition-all duration-700 ease-out"
                      :class="getSourceChannelDotClass(item.channel)"
                      :style="{ width: `${(item.count / maxChannelCount) * 100}%` }"
                    />
                  </div>
                </button>
              </div>
            </div>

            <!-- ─── Conversion funnel by source ─── -->
            <div
              v-if="Object.keys(funnel).length > 0"
              class="ui-table-shell shadow-xs dark:shadow-none"
            >
              <div class="ui-panel-divider flex items-center justify-between px-6 py-4">
                <div class="flex items-center gap-2.5">
                  <div class="ui-dashboard-soft-icon flex items-center justify-center size-7 rounded-lg">
                    <TrendingUp class="size-3.5 text-surface-500 dark:text-surface-400" />
                  </div>
                  <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Conversion by Source</h2>
                </div>
              </div>

              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="ui-table-header">
                      <th class="px-6 py-3 text-left text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Source</th>
                      <th class="px-3 py-3 text-center text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">New</th>
                      <th class="px-3 py-3 text-center text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Screening</th>
                      <th class="px-3 py-3 text-center text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Interview</th>
                      <th class="px-3 py-3 text-center text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Offer</th>
                      <th class="px-3 py-3 text-center text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Hired</th>
                      <th class="px-3 py-3 text-center text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Hire Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(stages, channel) in funnel"
                      :key="channel"
                      class="ui-table-row cursor-pointer"
                      @click="selectedChannel = channel as string; showTab = 'table'"
                    >
                      <td class="px-6 py-3">
                        <div class="flex items-center gap-2">
                          <div class="size-2 rounded-full" :class="getSourceChannelDotClass(channel as string)" />
                          <span class="font-medium text-surface-800 dark:text-surface-200">{{ getSourceChannelLabel(channel as string) }}</span>
                        </div>
                      </td>
                      <td class="px-3 py-3 text-center tabular-nums text-surface-600 dark:text-surface-300">{{ stages.new ?? 0 }}</td>
                      <td class="px-3 py-3 text-center tabular-nums text-surface-600 dark:text-surface-300">{{ stages.screening ?? 0 }}</td>
                      <td class="px-3 py-3 text-center tabular-nums text-surface-600 dark:text-surface-300">{{ stages.interview ?? 0 }}</td>
                      <td class="px-3 py-3 text-center tabular-nums text-surface-600 dark:text-surface-300">{{ stages.offer ?? 0 }}</td>
                      <td class="px-3 py-3 text-center tabular-nums font-semibold" :class="(stages.hired ?? 0) > 0 ? 'text-green-600 dark:text-green-400' : 'text-surface-600 dark:text-surface-300'">
                        {{ stages.hired ?? 0 }}
                      </td>
                      <td class="px-3 py-3 text-center">
                        <span
                          class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ring-1 ring-inset"
                          :class="conversionRate(channel as string) > 0
                            ? 'bg-green-50 text-green-700 ring-green-200/60 dark:bg-green-950 dark:text-green-400 dark:ring-green-800/40'
                            : 'bg-surface-100 text-surface-500 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700'"
                        >
                          {{ conversionRate(channel as string) }}%
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- ─── Right (1/3): Side panels ─── -->
          <div class="space-y-6">
            <!-- Top tracking links -->
            <div class="ui-panel ui-dashboard-panel shadow-xs dark:shadow-none">
              <div class="ui-panel-header ui-dashboard-panel-header flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <div class="flex items-center justify-center size-7 rounded-lg bg-surface-100 dark:bg-surface-800">
                    <Link2 class="size-3.5 text-surface-500 dark:text-surface-400" />
                  </div>
                  <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Top Links</h2>
                </div>
                <button
                  class="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 inline-flex items-center gap-1 group/link"
                  @click="showTab = 'links'"
                >
                  View all
                  <ArrowRight class="size-3 group-hover/link:translate-x-0.5 transition-transform" />
                </button>
              </div>

              <div v-if="topLinks.length === 0" class="px-5 py-10 text-center">
                <div class="mx-auto mb-3 flex items-center justify-center size-10 rounded-2xl bg-surface-100 dark:bg-surface-800">
                  <Link2 class="size-4 text-surface-400 dark:text-surface-500" />
                </div>
                <p class="text-xs font-medium text-surface-500 dark:text-surface-400">No links created yet</p>
              </div>

              <div v-else class="divide-y divide-surface-100 dark:divide-surface-800">
                <NuxtLink
                  v-for="link in topLinks.slice(0, 5)"
                  :key="link.id"
                  :to="localePath(`/dashboard/source-tracking/${link.id}`)"
                  class="block px-5 py-3.5 hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors cursor-pointer"
                >
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-surface-800 dark:text-surface-200 truncate hover:text-brand-600 dark:hover:text-brand-400 transition-colors">{{ link.name }}</span>
                    <span
                      class="ui-pill inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset shrink-0 ml-2"
                      :class="getSourceChannelBadgeClass(link.channel)"
                    >
                      {{ getSourceChannelLabel(link.channel) }}
                    </span>
                  </div>
                  <div class="flex items-center gap-4 text-xs text-surface-400">
                    <span class="inline-flex items-center gap-1 tabular-nums">
                      <MousePointerClick class="size-3" />
                      {{ link.clickCount }} clicks
                    </span>
                    <span class="inline-flex items-center gap-1 tabular-nums">
                      <Users class="size-3" />
                      {{ link.applicationCount }} apps
                    </span>
                    <span v-if="link.clickCount > 0" class="tabular-nums font-medium" :class="link.applicationCount > 0 ? 'text-green-600 dark:text-green-400' : ''">
                      {{ Math.round((link.applicationCount / link.clickCount) * 100) }}% CVR
                    </span>
                  </div>
                </NuxtLink>
              </div>
            </div>

            <!-- Top referrer domains -->
            <div class="ui-panel ui-dashboard-panel shadow-xs dark:shadow-none">
              <div class="ui-panel-header ui-dashboard-panel-header flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <div class="flex items-center justify-center size-7 rounded-lg bg-surface-100 dark:bg-surface-800">
                    <Globe class="size-3.5 text-surface-500 dark:text-surface-400" />
                  </div>
                  <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Top Referrers</h2>
                </div>
              </div>

              <div v-if="topReferrerDomains.length === 0" class="px-5 py-10 text-center">
                <div class="mx-auto mb-3 flex items-center justify-center size-10 rounded-2xl bg-surface-100 dark:bg-surface-800">
                  <Globe class="size-4 text-surface-400 dark:text-surface-500" />
                </div>
                <p class="text-xs font-medium text-surface-500 dark:text-surface-400">No referrer data yet</p>
              </div>

              <div v-else class="px-5 py-4 space-y-3">
                <div
                  v-for="ref in topReferrerDomains"
                  :key="ref.domain ?? 'unknown'"
                  class="flex items-center justify-between"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="size-5 rounded bg-surface-100 dark:bg-surface-800 flex items-center justify-center shrink-0">
                      <Globe class="size-3 text-surface-400" />
                    </div>
                    <span class="text-sm text-surface-700 dark:text-surface-300 truncate">{{ ref.domain ?? 'Unknown' }}</span>
                  </div>
                  <span class="text-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums shrink-0 ml-2">{{ ref.count }}</span>
                </div>
              </div>
            </div>

            <!-- Recent attributed -->
            <div class="ui-panel ui-dashboard-panel shadow-xs dark:shadow-none">
              <div class="ui-panel-header ui-dashboard-panel-header flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <div class="flex items-center justify-center size-7 rounded-lg bg-surface-100 dark:bg-surface-800">
                    <Clock class="size-3.5 text-surface-500 dark:text-surface-400" />
                  </div>
                  <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Recent Attributed</h2>
                </div>
                <button
                  class="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 inline-flex items-center gap-1 group/link"
                  @click="showTab = 'table'"
                >
                  View all
                  <ArrowRight class="size-3 group-hover/link:translate-x-0.5 transition-transform" />
                </button>
              </div>

              <div v-if="recentAttributed.length === 0" class="px-5 py-10 text-center">
                <p class="text-xs text-surface-400">No attributed applications yet</p>
              </div>

              <div v-else class="ui-list-divider divide-y divide-surface-100 dark:divide-surface-800">
                <NuxtLink
                  v-for="app in recentAttributed.slice(0, 5)"
                  :key="app.applicationId"
                  :to="localePath(`/dashboard/jobs/${app.jobId}/candidates`)"
                  class="ui-list-row flex items-center gap-3 px-5 py-3 hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors group"
                >
                  <div class="flex items-center justify-center size-8 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/80 dark:to-brand-800/80 shrink-0 ring-1 ring-brand-200/50 dark:ring-brand-800/50">
                    <span class="text-[10px] font-bold text-brand-700 dark:text-brand-300">
                      {{ ((app.candidateFirstName?.[0] ?? '') + (app.candidateLastName?.[0] ?? '')).toUpperCase() }}
                    </span>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                      {{ formatPersonName(app.candidateFirstName, app.candidateLastName) }}
                    </div>
                    <div class="text-xs text-surface-400 truncate">{{ app.jobTitle }}</div>
                  </div>
                  <span
                    class="ui-pill inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset shrink-0"
                    :class="getSourceChannelBadgeClass(app.channel)"
                  >
                    {{ getSourceChannelLabel(app.channel) }}
                  </span>
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- TAB: Tracking Links                     -->
      <!-- ═══════════════════════════════════════ -->
      <div v-if="showTab === 'links'">
        <div v-if="links.length === 0" class="flex flex-col items-center justify-center py-20">
          <div class="ui-empty-panel max-w-md p-14 shadow-sm">
            <div class="mx-auto mb-8 flex items-center justify-center size-18 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-lg shadow-brand-500/20">
              <Link2 class="size-9 text-white" />
            </div>
            <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-3 tracking-tight">
              Create Your First Tracking Link
            </h2>
            <p class="text-sm text-surface-500 dark:text-surface-400 mb-10 leading-relaxed max-w-sm mx-auto">
              Generate unique links for each job board, campaign, or referral source. Track clicks, applications, and conversions in real time.
            </p>
            <button
              v-if="canManageLinks"
              class="inline-flex items-center gap-2.5 rounded-xl bg-brand-600 px-7 py-3.5 text-sm font-semibold text-white hover:bg-brand-700 shadow-md shadow-brand-600/20 hover:shadow-lg hover:shadow-brand-600/25 transition-all"
              @click="showCreateModal = true"
            >
              <Plus class="size-4" />
              Create Tracking Link
            </button>
          </div>
        </div>

        <div v-else class="ui-table-shell shadow-xs dark:shadow-none">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="ui-table-header">
                  <th class="px-5 py-3 text-left text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider cursor-pointer select-none hover:text-surface-700 dark:hover:text-surface-200 transition-colors" @click="toggleLinkSort('name')">
                    <span class="inline-flex items-center gap-1">Name <ChevronUp v-if="linkSortKey === 'name' && linkSortAsc" class="size-3" /><ChevronDown v-else class="size-3" :class="linkSortKey === 'name' ? 'opacity-100' : 'opacity-0'" /></span>
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider cursor-pointer select-none hover:text-surface-700 dark:hover:text-surface-200 transition-colors" @click="toggleLinkSort('channel')">
                    <span class="inline-flex items-center gap-1">Source <ChevronUp v-if="linkSortKey === 'channel' && linkSortAsc" class="size-3" /><ChevronDown v-else class="size-3" :class="linkSortKey === 'channel' ? 'opacity-100' : 'opacity-0'" /></span>
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Job</th>
                  <th class="px-4 py-3 text-center text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider cursor-pointer select-none hover:text-surface-700 dark:hover:text-surface-200 transition-colors" @click="toggleLinkSort('clickCount')">
                    <span class="inline-flex items-center gap-1">Clicks <ChevronUp v-if="linkSortKey === 'clickCount' && linkSortAsc" class="size-3" /><ChevronDown v-else class="size-3" :class="linkSortKey === 'clickCount' ? 'opacity-100' : 'opacity-0'" /></span>
                  </th>
                  <th class="px-4 py-3 text-center text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider cursor-pointer select-none hover:text-surface-700 dark:hover:text-surface-200 transition-colors" @click="toggleLinkSort('applicationCount')">
                    <span class="inline-flex items-center gap-1">Apps <ChevronUp v-if="linkSortKey === 'applicationCount' && linkSortAsc" class="size-3" /><ChevronDown v-else class="size-3" :class="linkSortKey === 'applicationCount' ? 'opacity-100' : 'opacity-0'" /></span>
                  </th>
                  <th class="px-4 py-3 text-center text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider cursor-pointer select-none hover:text-surface-700 dark:hover:text-surface-200 transition-colors" @click="toggleLinkSort('cvr')">
                    <span class="inline-flex items-center gap-1">CVR <ChevronUp v-if="linkSortKey === 'cvr' && linkSortAsc" class="size-3" /><ChevronDown v-else class="size-3" :class="linkSortKey === 'cvr' ? 'opacity-100' : 'opacity-0'" /></span>
                  </th>
                  <th class="px-4 py-3 text-center text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider cursor-pointer select-none hover:text-surface-700 dark:hover:text-surface-200 transition-colors" @click="toggleLinkSort('isActive')">
                    <span class="inline-flex items-center gap-1">Status <ChevronUp v-if="linkSortKey === 'isActive' && linkSortAsc" class="size-3" /><ChevronDown v-else class="size-3" :class="linkSortKey === 'isActive' ? 'opacity-100' : 'opacity-0'" /></span>
                  </th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="link in sortedLinks" :key="link.id" class="ui-table-row group">
                  <!-- Name + URL -->
                  <td class="px-5 py-3.5">
                    <NuxtLink
                      :to="localePath(`/dashboard/source-tracking/${link.id}`)"
                      class="font-medium text-surface-800 dark:text-surface-200 mb-0.5 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    >
                      {{ link.name }}
                    </NuxtLink>
                    <div class="ui-code text-[11px] truncate max-w-[200px]">
                      ?ref={{ link.code }}
                    </div>
                  </td>
                  <!-- Channel -->
                  <td class="px-4 py-3.5">
                    <span
                      class="ui-pill inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset"
                      :class="getSourceChannelBadgeClass(link.channel)"
                    >
                      {{ getSourceChannelLabel(link.channel) }}
                    </span>
                  </td>
                  <!-- Job -->
                  <td class="px-4 py-3.5 text-surface-600 dark:text-surface-300 truncate max-w-[150px]">
                    {{ link.jobTitle ?? 'All jobs' }}
                  </td>
                  <!-- Clicks -->
                  <td class="px-4 py-3.5 text-center tabular-nums font-medium text-surface-700 dark:text-surface-200">
                    {{ link.clickCount }}
                  </td>
                  <!-- Applications -->
                  <td class="px-4 py-3.5 text-center tabular-nums font-medium text-surface-700 dark:text-surface-200">
                    {{ link.applicationCount }}
                  </td>
                  <!-- CVR -->
                  <td class="px-4 py-3.5 text-center">
                    <span class="tabular-nums font-bold" :class="link.clickCount > 0 && link.applicationCount > 0 ? 'text-green-600 dark:text-green-400' : 'text-surface-400'">
                      {{ link.clickCount > 0 ? `${Math.round((link.applicationCount / link.clickCount) * 100)}%` : '—' }}
                    </span>
                  </td>
                  <!-- Status -->
                  <td class="px-4 py-3.5 text-center">
                    <span
                      class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset"
                      :class="link.isActive
                        ? 'bg-green-50 text-green-700 ring-green-200/60 dark:bg-green-950 dark:text-green-400 dark:ring-green-800/40'
                        : 'bg-surface-100 text-surface-500 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700'"
                    >
                      <CheckCircle2 v-if="link.isActive" class="size-3" />
                      <XCircle v-else class="size-3" />
                      {{ link.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <!-- Actions -->
                  <td class="px-4 py-3.5 text-right">
                    <div class="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        class="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                        title="Copy tracking URL"
                        @click="copyTrackingUrl(link.code)"
                      >
                        <Copy v-if="copiedCode !== link.code" class="size-3.5" />
                        <CheckCircle2 v-else class="size-3.5 text-green-500" />
                      </button>
                      <button
                        v-if="canManageLinks"
                        class="p-1.5 rounded-lg text-surface-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                        :title="link.isActive ? 'Deactivate' : 'Activate'"
                        @click="toggleLink(link.id, !link.isActive)"
                      >
                        <ToggleRight v-if="link.isActive" class="size-3.5" />
                        <ToggleLeft v-else class="size-3.5" />
                      </button>
                      <button
                        v-if="canManageLinks"
                        class="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                        title="Delete"
                        @click="confirmDelete(link.id)"
                      >
                        <Trash2 class="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- TAB: Attribution Log                    -->
      <!-- ═══════════════════════════════════════ -->
      <div v-if="showTab === 'table'">
        <!-- Channel filter chip -->
        <div v-if="selectedChannel" class="mb-4 flex items-center gap-2">
          <span class="text-xs text-surface-500 dark:text-surface-400">Filtered by:</span>
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset"
            :class="getSourceChannelBadgeClass(selectedChannel)"
          >
            <span class="size-1.5 rounded-full" :class="getSourceChannelDotClass(selectedChannel)" />
            {{ getSourceChannelLabel(selectedChannel) }}
            <button class="ml-0.5 hover:text-surface-900 dark:hover:text-surface-100 transition-colors" @click="selectedChannel = undefined">
              <X class="size-3" />
            </button>
          </span>
        </div>

        <div v-if="filteredAttributed.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
          <div class="mx-auto mb-4 flex items-center justify-center size-14 rounded-2xl bg-surface-100 dark:bg-surface-800">
            <Users class="size-6 text-surface-400 dark:text-surface-500" />
          </div>
          <p class="text-sm font-medium text-surface-500 dark:text-surface-400 mb-1">No attributed applications</p>
          <p class="text-xs text-surface-400 dark:text-surface-500 max-w-sm">
            Start sharing your tracking links to see source attribution data here.
          </p>
        </div>

        <div v-else class="ui-table-shell shadow-xs dark:shadow-none">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="ui-table-header">
                  <th class="px-5 py-3 text-left text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Candidate</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Job</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Source</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Campaign</th>
                  <th class="px-4 py-3 text-center text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Status</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Applied</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="app in filteredAttributed" :key="app.applicationId" class="ui-table-row">
                  <!-- Candidate -->
                  <td class="px-5 py-3.5">
                    <NuxtLink
                      :to="localePath({ path: `/dashboard/jobs/${app.jobId}`, query: { stage: app.status } })"
                      class="flex items-center gap-2.5 group/candidate"
                    >
                      <div class="flex items-center justify-center size-8 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/80 dark:to-brand-800/80 shrink-0 ring-1 ring-brand-200/50 dark:ring-brand-800/50">
                        <span class="text-[10px] font-bold text-brand-700 dark:text-brand-300">
                          {{ ((app.candidateFirstName?.[0] ?? '') + (app.candidateLastName?.[0] ?? '')).toUpperCase() }}
                        </span>
                      </div>
                      <div class="min-w-0">
                        <div class="text-sm font-medium text-surface-800 dark:text-surface-200 truncate group-hover/candidate:text-brand-600 dark:group-hover/candidate:text-brand-400 transition-colors">
                          {{ formatPersonName(app.candidateFirstName, app.candidateLastName) }}
                        </div>
                        <div class="text-[11px] text-surface-400 truncate">{{ app.candidateEmail }}</div>
                      </div>
                    </NuxtLink>
                  </td>
                  <!-- Job -->
                  <td class="px-4 py-3.5 text-surface-600 dark:text-surface-300 truncate max-w-[150px]">
                    {{ app.jobTitle }}
                  </td>
                  <!-- Source channel -->
                  <td class="px-4 py-3.5">
                    <div class="flex items-center gap-2">
                      <span
                        class="ui-pill inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset"
                        :class="getSourceChannelBadgeClass(app.channel)"
                      >
                        {{ getSourceChannelLabel(app.channel) }}
                      </span>
                    </div>
                    <div v-if="app.trackingLinkName" class="text-[11px] text-surface-400 mt-0.5 truncate max-w-[140px]">
                      via {{ app.trackingLinkName }}
                    </div>
                    <div v-else-if="app.referrerDomain" class="text-[11px] text-surface-400 mt-0.5 truncate max-w-[140px]">
                      {{ app.referrerDomain }}
                    </div>
                  </td>
                  <!-- Campaign -->
                  <td class="px-4 py-3.5 text-xs text-surface-500 dark:text-surface-400 truncate max-w-[120px]">
                    {{ app.utmCampaign ?? '—' }}
                  </td>
                  <!-- Status -->
                  <td class="px-4 py-3.5 text-center">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ring-inset"
                      :class="getApplicationStatusBadgeClass(app.status)"
                    >
                      {{ app.status }}
                    </span>
                  </td>
                  <!-- Applied date -->
                  <td class="px-4 py-3.5 text-right text-[11px] text-surface-400 tabular-nums font-medium">
                    {{ formatDate(app.appliedAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════════════════════════════════════ -->
    <!-- Modal: Create tracking link             -->
    <!-- ═══════════════════════════════════════ -->
    <Teleport to="body">
      <div
        v-if="showCreateModal"
        class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50 grid place-items-center p-4"
        @click.self="showCreateModal = false"
      >
        <div class="ui-modal-panel relative w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto">
          <!-- Header -->
          <div class="ui-panel-header flex items-center justify-between px-6 py-5">
            <h2 class="text-xl font-semibold text-white">Create Tracking Link</h2>
            <button
              type="button"
              aria-label="Close create tracking link form"
              class="ui-button ui-button-ghost size-9 p-0"
              @click="showCreateModal = false"
            >
              <X class="size-4" />
            </button>
          </div>

          <!-- Body -->
          <form class="space-y-5 px-6 py-5" @submit.prevent="handleCreateLink">
            <!-- Name -->
            <div>
              <label for="link-name" class="mb-2 block text-xs font-semibold uppercase text-white/55">Link Name</label>
              <input
                id="link-name"
                v-model="newLink.name"
                type="text"
                placeholder="e.g. LinkedIn Spring Campaign"
                class="ui-field px-4 py-3"
              />
            </div>

            <!-- Channel -->
            <div>
              <label for="link-channel" class="mb-2 block text-xs font-semibold uppercase text-white/55">Source Channel</label>
              <FactorySelect
                id="link-channel"
                v-model="newLink.channel"
                :options="[
                  ...['linkedin', 'indeed', 'glassdoor', 'ziprecruiter', 'monster', 'handshake', 'angellist', 'wellfound', 'dice', 'stackoverflow', 'weworkremotely', 'remoteok', 'builtin', 'hired', 'lever', 'greenhouse_board', 'google_jobs'].map(ch => ({ value: ch, label: getSourceChannelLabel(ch) })),
                  ...['facebook', 'twitter', 'instagram', 'tiktok', 'reddit'].map(ch => ({ value: ch, label: getSourceChannelLabel(ch) })),
                  ...['referral', 'career_site', 'email', 'event', 'agency', 'direct', 'custom', 'other'].map(ch => ({ value: ch, label: getSourceChannelLabel(ch) }))
                ]"
              />
            </div>

            <!-- Job (optional) -->
            <div>
              <label for="link-job" class="mb-2 block text-xs font-semibold uppercase text-white/55">
                Scope to Job <span class="font-normal text-white/35">(optional)</span>
              </label>
              <FactorySelect
                id="link-job"
                v-model="newLink.jobId"
                :options="[
                  { value: '', label: 'All jobs (org-wide)' },
                  ...jobs.map((j: { id: string; title: string }) => ({ value: j.id, label: j.title }))
                ]"
              />
            </div>

            <!-- UTM fields (collapsible) -->
            <details class="ui-panel-muted group p-4">
              <summary class="ui-disclosure-trigger flex cursor-pointer select-none items-center gap-2 text-xs font-semibold uppercase">
                <ChevronDown class="size-4 text-brand-500 transition-transform group-open:rotate-180" />
                UTM Parameters (optional)
              </summary>
              <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label for="utm-source" class="mb-1.5 block text-xs font-semibold uppercase text-white/45">utm_source</label>
                  <input id="utm-source" v-model="newLink.utmSource" type="text" placeholder="linkedin" class="ui-field px-3 py-2.5 text-xs" />
                </div>
                <div>
                  <label for="utm-medium" class="mb-1.5 block text-xs font-semibold uppercase text-white/45">utm_medium</label>
                  <input id="utm-medium" v-model="newLink.utmMedium" type="text" placeholder="social" class="ui-field px-3 py-2.5 text-xs" />
                </div>
                <div class="sm:col-span-2">
                  <label for="utm-campaign" class="mb-1.5 block text-xs font-semibold uppercase text-white/45">utm_campaign</label>
                  <input id="utm-campaign" v-model="newLink.utmCampaign" type="text" placeholder="spring-hiring-2026" class="ui-field px-3 py-2.5 text-xs" />
                </div>
              </div>
            </details>

            <!-- Footer -->
            <div class="flex items-center justify-end gap-3 border-t border-white/12 pt-5">
              <button
                type="button"
                class="ui-button ui-button-secondary px-4 py-2.5 text-sm"
                @click="showCreateModal = false"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="!newLink.name.trim() || isCreating"
                class="ui-button ui-button-primary px-5 py-2.5 text-sm font-semibold disabled:pointer-events-none"
              >
                {{ isCreating ? 'Creating...' : 'Create Link' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- ═══════════════════════════════════════ -->
    <!-- Modal: Delete confirmation               -->
    <!-- ═══════════════════════════════════════ -->
    <Teleport to="body">
      <div
        v-if="showDeleteConfirm"
        class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50 grid place-items-center p-4"
        @click.self="showDeleteConfirm = false"
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
              @click="showDeleteConfirm = false"
            >
              Cancel
            </button>
            <button
              class="ui-button ui-button-danger px-5 py-2.5 text-sm font-semibold"
              @click="handleDelete"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
