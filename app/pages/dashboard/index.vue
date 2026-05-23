<script setup lang="ts">
import {
  Briefcase, Users, FileText, Calendar, Plus,
  ArrowRight, TrendingUp, Clock, AlertCircle,
  Eye, UserPlus, ExternalLink,
  LayoutDashboard, Zap,
} from 'lucide-vue-next'
import { getApplicationStatusBadgeClass } from '~/utils/status-display'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

useSeoMeta({
  title: 'Dashboard — Factory Careers',
  description: 'Your recruiting command center',
})

const { activeOrg } = useCurrentOrg()
const localePath = useLocalePath()
const { track } = useTrack()
const { formatPersonName } = useOrgSettings()

let dashboardNowTimer: ReturnType<typeof setInterval> | undefined

// ─────────────────────────────────────────────
// Fetch dashboard stats
// ─────────────────────────────────────────────

const {
  counts,
  jobsByStatus,
  recentApplications,
  topJobs,
  fetchStatus,
  error,
  refresh,
} = useDashboard()

// ─────────────────────────────────────────────
// Upcoming interviews (next 7 days)
// ─────────────────────────────────────────────

const dashboardNowIso = useState('dashboard-upcoming-interviews-now', () => new Date().toISOString())
const dashboardInterviewQueryFromIso = useState('dashboard-upcoming-interviews-query-from', () => new Date().toISOString())
const dashboardNow = computed(() => new Date(dashboardNowIso.value))
const dashboardInterviewQueryToIso = computed(() =>
  new Date(new Date(dashboardInterviewQueryFromIso.value).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
)

const { interviews: upcomingInterviews } = useInterviews({
  status: 'scheduled',
  from: dashboardInterviewQueryFromIso,
  to: dashboardInterviewQueryToIso,
  limit: 5,
})

const upcomingInterviewsForCard = computed(() =>
  upcomingInterviews.value.filter((interview) =>
    new Date(interview.scheduledAt).getTime() >= dashboardNow.value.getTime(),
  ),
)

onMounted(() => {
  track('dashboard_viewed')
  const mountedAtIso = new Date().toISOString()
  dashboardNowIso.value = mountedAtIso
  dashboardInterviewQueryFromIso.value = mountedAtIso
  dashboardNowTimer = setInterval(() => {
    dashboardNowIso.value = new Date().toISOString()
  }, 60_000)
})

onUnmounted(() => {
  if (dashboardNowTimer) clearInterval(dashboardNowTimer)
})

// ─────────────────────────────────────────────
// Derived data
// ─────────────────────────────────────────────

const stageConfig = [
  { key: 'new', label: 'New', segmentClass: 'factory-pipeline-segment-new', stageClass: 'factory-pipeline-stage-new' },
  { key: 'screening', label: 'Screening', segmentClass: 'factory-pipeline-segment-screening', stageClass: 'factory-pipeline-stage-screening' },
  { key: 'interview', label: 'Interview', segmentClass: 'factory-pipeline-segment-interview', stageClass: 'factory-pipeline-stage-interview' },
  { key: 'offer', label: 'Offer', segmentClass: 'factory-pipeline-segment-offer', stageClass: 'factory-pipeline-stage-offer' },
  { key: 'hired', label: 'Hired', segmentClass: 'factory-pipeline-segment-hired', stageClass: 'factory-pipeline-stage-hired' },
  { key: 'rejected', label: 'Rejected', segmentClass: 'factory-pipeline-segment-rejected', stageClass: 'factory-pipeline-stage-rejected' },
] as const

const stageCountKeys: Record<string, string> = {
  new: 'newCount',
  screening: 'screeningCount',
  interview: 'interviewCount',
  offer: 'offerCount',
  hired: 'hiredCount',
  rejected: 'rejectedCount',
}

function getJobStageCount(job: (typeof topJobs.value)[number], stageKey: string): number {
  const key = stageCountKeys[stageKey]
  if (!key) return 0
  return (job as any)[key] ?? 0
}

function getJobActiveTotal(job: (typeof topJobs.value)[number]): number {
  return getJobStageCount(job, 'new')
    + getJobStageCount(job, 'screening')
    + getJobStageCount(job, 'interview')
    + getJobStageCount(job, 'offer')
}

const interviewTypeLabels: Record<string, string> = {
  phone: 'Phone',
  video: 'Video',
  in_person: 'In-person',
  panel: 'Panel',
  technical: 'Technical',
  take_home: 'Take-home',
}

function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr)
  const diffMs = date.getTime() - dashboardNow.value.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffMs <= 0) return 'Now'
  if (diffDays === 0) {
    return `In ${diffHours}h`
  }
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 7) return `In ${diffDays} days`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const diffMs = dashboardNow.value.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const isEmpty = computed(() =>
  counts.value.openJobs === 0
  && counts.value.totalCandidates === 0
  && counts.value.totalApplications === 0,
)
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <!-- ─── Loading skeleton ─── -->
    <div v-if="fetchStatus === 'pending'">
      <!-- Header skeleton -->
      <div class="mb-10">
        <div class="h-8 w-56 bg-surface-200 dark:bg-surface-700 rounded-lg animate-pulse mb-2" />
        <div class="h-4 w-40 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
      </div>
      <!-- Stats skeleton -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div v-for="i in 4" :key="i" class="ui-dashboard-stat-card p-6 animate-pulse">
          <div class="h-4 w-20 bg-surface-200 dark:bg-surface-700 rounded mb-4" />
          <div class="h-9 w-14 bg-surface-200 dark:bg-surface-700 rounded" />
        </div>
      </div>
      <!-- Content skeleton -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="ui-panel ui-dashboard-panel lg:col-span-2 p-6 animate-pulse">
          <div class="h-5 w-32 bg-surface-200 dark:bg-surface-700 rounded mb-6" />
          <div class="space-y-4">
            <div v-for="i in 3" :key="i" class="h-20 bg-surface-100 dark:bg-surface-800 rounded-xl" />
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
      v-else-if="error"
      class="ui-alert ui-alert-danger flex items-center gap-3 p-5"
    >
      <AlertCircle class="size-5 shrink-0" />
      <span>Failed to load dashboard.</span>
      <button class="underline ml-auto font-medium cursor-pointer" @click="refresh()">Retry</button>
    </div>

    <!-- ─── Empty state (brand new org) ─── -->
    <div v-else-if="isEmpty" class="flex flex-col items-center justify-center py-24">
      <div class="ui-empty-panel max-w-md p-14 shadow-sm">
        <div class="mx-auto mb-8 flex items-center justify-center size-18 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/20">
          <LayoutDashboard class="size-9 text-white" />
        </div>
        <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-3 tracking-tight">
          Welcome to Factory Careers
        </h2>
        <p class="text-sm text-surface-500 dark:text-surface-400 mb-10 leading-relaxed max-w-sm mx-auto">
          Your recruiting command center. Create your first job posting to start building your hiring pipeline.
        </p>
        <NuxtLink
          :to="localePath('/dashboard/jobs/new')"
          class="factory-button-cta factory-button-premium inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 text-sm font-semibold transition-all no-underline"
        >
          <Plus class="size-4" />
          Create Your First Job
        </NuxtLink>
      </div>
    </div>

    <!-- ─── Dashboard content ─── -->
    <template v-else>
      <!-- ─── Header ─── -->
      <div class="flex items-center justify-between mb-6 sm:mb-10">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold text-surface-900 dark:text-surface-50 tracking-tight">Dashboard</h1>
          <p v-if="activeOrg" class="text-sm text-surface-400 dark:text-surface-500 mt-1">
            {{ activeOrg.name }}
          </p>
        </div>
      </div>

      <!-- ─── Stat cards ─── -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-10">
        <!-- Open Jobs -->
        <NuxtLink
          :to="localePath('/dashboard/jobs')"
          class="group ui-dashboard-stat-card p-3 sm:p-4 lg:p-6 no-underline ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-brand-500/25 dark:hover:ring-brand-400/25 hover:shadow-lg hover:shadow-brand-500/[0.08]"
        >
          <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
          <Briefcase class="absolute -bottom-3 -right-3 size-16 sm:size-20 lg:size-24 text-brand-500/[0.05] dark:text-brand-400/[0.085] rotate-12 transition-transform duration-700 ease-out group-hover:rotate-3 group-hover:scale-110 pointer-events-none" />
          <div class="relative">
            <div class="flex items-baseline gap-2">
              <span class="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-surface-900 dark:text-surface-50 tabular-nums leading-none transition-colors duration-300 group-hover:text-brand-600 dark:group-hover:text-brand-400">
                {{ counts.openJobs }}
              </span>
              <span class="factory-dashboard-stat-dot bg-brand-500 shrink-0 mb-1" />
            </div>
            <span class="block mt-2 lg:mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-400 dark:text-surface-500">Open Jobs</span>
            <p class="text-[11px] text-surface-300 dark:text-surface-600 mt-1">
              {{ jobsByStatus.draft }} draft{{ jobsByStatus.draft === 1 ? '' : 's' }}
            </p>
          </div>
        </NuxtLink>

        <!-- Total Candidates -->
        <NuxtLink
          :to="localePath('/dashboard/candidates')"
          class="group ui-dashboard-stat-card p-3 sm:p-4 lg:p-6 no-underline ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-violet-500/25 dark:hover:ring-violet-400/25 hover:shadow-lg hover:shadow-violet-500/[0.08]"
        >
          <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
          <Users class="absolute -bottom-3 -right-3 size-16 sm:size-20 lg:size-24 text-violet-500/[0.05] dark:text-violet-400/[0.085] rotate-12 transition-transform duration-700 ease-out group-hover:rotate-3 group-hover:scale-110 pointer-events-none" />
          <div class="relative">
            <div class="flex items-baseline gap-2">
              <span class="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-surface-900 dark:text-surface-50 tabular-nums leading-none transition-colors duration-300 group-hover:text-violet-600 dark:group-hover:text-violet-400">
                {{ counts.totalCandidates }}
              </span>
              <span class="factory-dashboard-stat-dot bg-violet-500 shrink-0 mb-1" />
            </div>
            <span class="block mt-2 lg:mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-400 dark:text-surface-500">Candidates</span>
            <p class="text-[11px] text-surface-300 dark:text-surface-600 mt-1">Talent pool</p>
          </div>
        </NuxtLink>

        <!-- Total Applications -->
        <NuxtLink
          :to="localePath('/dashboard/applications')"
          class="group ui-dashboard-stat-card p-3 sm:p-4 lg:p-6 no-underline ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-teal-500/25 dark:hover:ring-teal-400/25 hover:shadow-lg hover:shadow-teal-500/[0.08]"
        >
          <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-500 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
          <FileText class="absolute -bottom-3 -right-3 size-16 sm:size-20 lg:size-24 text-teal-500/[0.05] dark:text-teal-400/[0.085] rotate-12 transition-transform duration-700 ease-out group-hover:rotate-3 group-hover:scale-110 pointer-events-none" />
          <div class="relative">
            <div class="flex items-baseline gap-2">
              <span class="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-surface-900 dark:text-surface-50 tabular-nums leading-none transition-colors duration-300 group-hover:text-teal-600 dark:group-hover:text-teal-400">
                {{ counts.totalApplications }}
              </span>
              <span class="factory-dashboard-stat-dot bg-teal-500 shrink-0 mb-1" />
            </div>
            <span class="block mt-2 lg:mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-400 dark:text-surface-500">Applications</span>
            <p class="text-[11px] text-surface-300 dark:text-surface-600 mt-1">Total received</p>
          </div>
        </NuxtLink>

        <!-- To Review -->
        <NuxtLink
          :to="localePath({ path: '/dashboard/applications', query: { status: 'new' } })"
          class="group ui-dashboard-stat-card p-3 sm:p-4 lg:p-6 no-underline"
          :class="counts.newApplications > 0
            ? 'ring-1 ring-warning-400/30 dark:ring-warning-500/20 hover:ring-warning-500/40 dark:hover:ring-warning-400/30 shadow-sm shadow-warning-500/[0.06] hover:shadow-lg hover:shadow-warning-500/[0.12]'
            : 'ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-surface-300/50 dark:hover:ring-surface-600/30 hover:shadow-lg hover:shadow-surface-500/[0.04]'"
        >
          <div
            class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent transition-opacity duration-500"
            :class="counts.newApplications > 0
              ? 'via-warning-500 opacity-60 group-hover:opacity-100'
              : 'via-surface-400 opacity-40 group-hover:opacity-70'"
          />
          <AlertCircle class="absolute -bottom-3 -right-3 size-16 sm:size-20 lg:size-24 rotate-12 transition-transform duration-700 ease-out group-hover:rotate-3 group-hover:scale-110 pointer-events-none" :class="counts.newApplications > 0 ? 'text-warning-500/[0.06] dark:text-warning-400/[0.095]' : 'text-surface-400/[0.05] dark:text-surface-500/[0.085]'" />
          <div class="relative">
            <div class="flex items-baseline gap-2">
              <span
                class="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight tabular-nums leading-none transition-colors duration-300"
                :class="counts.newApplications > 0
                  ? 'text-warning-600 dark:text-warning-400 group-hover:text-warning-700 dark:group-hover:text-warning-300'
                  : 'text-surface-900 dark:text-surface-50 group-hover:text-surface-600 dark:group-hover:text-surface-300'"
              >
                {{ counts.newApplications }}
              </span>
              <span class="relative shrink-0 mb-1">
                <span class="factory-dashboard-stat-dot" :class="counts.newApplications > 0 ? 'bg-warning-500' : 'bg-surface-300 dark:bg-surface-600'" />
                <span v-if="counts.newApplications > 0" class="factory-dashboard-stat-dot factory-dashboard-stat-dot-ping absolute inset-0 bg-warning-500 animate-ping" />
              </span>
            </div>
            <span class="block mt-2 lg:mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-400 dark:text-surface-500">To Review</span>
            <p class="text-[11px] mt-1" :class="counts.newApplications > 0 ? 'text-warning-500 dark:text-warning-500 font-medium' : 'text-surface-300 dark:text-surface-600'">
              {{ counts.newApplications > 0 ? 'Needs attention' : 'All reviewed' }}
            </p>
          </div>
        </NuxtLink>
      </div>

      <!-- ─── Main content grid ─── -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- ─── Left column (2/3) ─── -->
        <div class="lg:col-span-2 space-y-6">
          <!-- ─── Pipeline overview (per job) ─── -->
          <div class="ui-panel ui-dashboard-panel factory-pipeline-card shadow-xs dark:shadow-none">
            <div class="ui-panel-header ui-dashboard-panel-header factory-pipeline-card-header flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="factory-pipeline-icon flex items-center justify-center size-9 rounded-lg bg-surface-100 dark:bg-surface-800">
                  <TrendingUp class="size-4" />
                </div>
                <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100">Hiring Pipeline</h2>
              </div>
              <NuxtLink
                :to="localePath('/dashboard/jobs')"
                class="factory-pipeline-all-link text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 no-underline inline-flex items-center gap-1.5 group/link"
              >
                All jobs
                <ArrowRight class="size-4 group-hover/link:translate-x-0.5 transition-transform" />
              </NuxtLink>
            </div>

            <div v-if="topJobs.length === 0" class="px-6 py-12 text-center">
              <div class="mx-auto mb-4 flex items-center justify-center size-12 rounded-2xl bg-surface-100 dark:bg-surface-800">
                <Briefcase class="size-5 text-surface-400 dark:text-surface-500" />
              </div>
              <p class="text-sm font-medium text-surface-500 dark:text-surface-400 mb-1">No open jobs</p>
              <p class="text-xs text-surface-400 dark:text-surface-500 mb-4">Create your first job to see the pipeline</p>
              <NuxtLink
                :to="localePath('/dashboard/jobs/new')"
                class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 no-underline hover:text-brand-700 dark:hover:text-brand-300"
              >
                <Plus class="size-3.5" />
                Create one
              </NuxtLink>
            </div>

            <div v-else class="divide-y divide-surface-100 dark:divide-surface-800">
              <div v-for="j in topJobs" :key="j.id" class="factory-pipeline-job px-6 py-6 group/job">
                <!-- Job title row -->
                <div class="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <NuxtLink
                    :to="localePath(`/dashboard/jobs/${j.id}`)"
                    class="text-lg font-semibold text-surface-900 dark:text-surface-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors no-underline truncate"
                  >
                    {{ j.title }}
                  </NuxtLink>
                  <span class="factory-pipeline-total text-sm text-surface-400 dark:text-surface-500 shrink-0 tabular-nums font-medium">
                    {{ j.applicationCount }} total
                  </span>
                </div>

                <!-- Pipeline bar for this job -->
                <div v-if="j.applicationCount > 0" class="mb-5">
                  <div class="factory-pipeline-track flex h-2 overflow-hidden bg-surface-100 dark:bg-surface-800">
                    <div
                      v-for="stage in stageConfig.filter(s => getJobStageCount(j, s.key) > 0)"
                      :key="stage.key"
                      class="factory-pipeline-segment transition-all duration-500"
                      :class="stage.segmentClass"
                      :style="{ width: `${(getJobStageCount(j, stage.key) / j.applicationCount) * 100}%` }"
                    />
                  </div>
                </div>

                <!-- Stage counts for this job -->
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <NuxtLink
                    v-for="stage in stageConfig"
                    :key="stage.key"
                    :to="localePath(`/dashboard/jobs/${j.id}?stage=${stage.key}`)"
                    class="factory-pipeline-stage rounded-lg px-2 py-3 text-center transition-all duration-150 no-underline hover:ring-1 hover:ring-brand-300/50 dark:hover:ring-brand-700/50 hover:shadow-sm"
                    :class="[stage.stageClass, getJobStageCount(j, stage.key) > 0 ? 'is-active cursor-pointer' : 'is-empty']"
                  >
                    <div class="factory-pipeline-stage-count text-lg font-semibold tabular-nums">
                      {{ getJobStageCount(j, stage.key) }}
                    </div>
                    <div class="factory-pipeline-stage-label text-xs font-medium text-surface-500 dark:text-surface-400 leading-tight">
                      {{ stage.label }}
                    </div>
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>

          <!-- ─── Recent applications ─── -->
          <div class="ui-panel ui-dashboard-panel shadow-xs dark:shadow-none">
            <div class="ui-panel-header ui-dashboard-panel-header flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="flex items-center justify-center size-7 rounded-lg bg-surface-100 dark:bg-surface-800">
                  <Clock class="size-3.5 text-surface-500 dark:text-surface-400" />
                </div>
                <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Recent Applications</h2>
              </div>
              <NuxtLink
                :to="localePath('/dashboard/applications')"
                class="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 no-underline inline-flex items-center gap-1 group/link"
              >
                View all
                <ArrowRight class="size-3 group-hover/link:translate-x-0.5 transition-transform" />
              </NuxtLink>
            </div>

            <div v-if="recentApplications.length === 0" class="px-6 py-12 text-center">
              <div class="mx-auto mb-4 flex items-center justify-center size-12 rounded-2xl bg-surface-100 dark:bg-surface-800">
                <FileText class="size-5 text-surface-400 dark:text-surface-500" />
              </div>
              <p class="text-sm font-medium text-surface-500 dark:text-surface-400">No applications yet</p>
            </div>

            <div v-else class="divide-y divide-surface-100 dark:divide-surface-800">
              <NuxtLink
                v-for="app in recentApplications"
                :key="app.id"
                :to="localePath(`/dashboard/applications/${app.id}`)"
                class="flex items-center gap-4 px-6 py-3.5 hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors no-underline group"
              >
                <!-- Avatar -->
                <div class="flex items-center justify-center size-9 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/80 dark:to-brand-800/80 shrink-0 ring-1 ring-brand-200/50 dark:ring-brand-800/50">
                  <span class="text-xs font-bold text-brand-700 dark:text-brand-300">
                    {{ ((app.candidateFirstName?.[0] ?? '') + (app.candidateLastName?.[0] ?? '')).toUpperCase() }}
                  </span>
                </div>

                <!-- Info -->
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-sm font-medium text-surface-900 dark:text-surface-100 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {{ formatPersonName(app.candidateFirstName, app.candidateLastName) }}
                    </span>
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize shrink-0 ring-1 ring-inset"
                      :class="getApplicationStatusBadgeClass(app.status, 'subtle-ring')"
                    >
                      {{ app.status }}
                    </span>
                  </div>
                  <div class="text-xs text-surface-400 dark:text-surface-500 truncate">
                    {{ app.jobTitle }}
                  </div>
                </div>

                <!-- Time -->
                <span class="text-[11px] text-surface-400 dark:text-surface-500 shrink-0 tabular-nums font-medium">
                  {{ formatDate(app.createdAt) }}
                </span>
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- ─── Right column (1/3) ─── -->
        <div class="space-y-6">
          <!-- ─── Upcoming interviews ─── -->
          <div class="ui-panel ui-dashboard-panel shadow-xs dark:shadow-none">
            <div class="ui-panel-header ui-dashboard-panel-header flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="flex items-center justify-center size-7 rounded-lg bg-surface-100 dark:bg-surface-800">
                  <Calendar class="size-3.5 text-surface-500 dark:text-surface-400" />
                </div>
                <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Upcoming Interviews</h2>
              </div>
              <NuxtLink
                :to="localePath('/dashboard/interviews')"
                class="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 no-underline inline-flex items-center gap-1 group/link"
              >
                All
                <ArrowRight class="size-3 group-hover/link:translate-x-0.5 transition-transform" />
              </NuxtLink>
            </div>

            <div v-if="upcomingInterviewsForCard.length === 0" class="px-5 py-10 text-center">
              <div class="mx-auto mb-4 flex items-center justify-center size-12 rounded-2xl bg-surface-100 dark:bg-surface-800">
                <Calendar class="size-5 text-surface-400 dark:text-surface-500" />
              </div>
              <p class="text-sm font-medium text-surface-500 dark:text-surface-400 mb-0.5">No upcoming interviews</p>
              <p class="text-xs text-surface-400 dark:text-surface-500">Next 7 days</p>
            </div>

            <div v-else class="divide-y divide-surface-100 dark:divide-surface-800">
              <NuxtLink
                v-for="interview in upcomingInterviewsForCard"
                :key="interview.id"
                :to="localePath(`/dashboard/interviews/${interview.id}`)"
                class="block px-5 py-3.5 hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors no-underline group"
              >
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-sm font-medium text-surface-900 dark:text-surface-100 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {{ formatPersonName(interview.candidateFirstName, interview.candidateLastName) }}
                  </span>
                  <span class="inline-flex items-center rounded-full bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:text-brand-400 shrink-0 ml-2">
                    {{ formatRelativeDate(interview.scheduledAt) }}
                  </span>
                </div>
                <div class="flex items-center gap-2 text-xs text-surface-400 dark:text-surface-500">
                  <span class="font-medium">{{ formatTime(interview.scheduledAt) }}</span>
                  <span class="text-surface-200 dark:text-surface-700">·</span>
                  <span>{{ interviewTypeLabels[interview.type] ?? interview.type }}</span>
                  <span class="text-surface-200 dark:text-surface-700">·</span>
                  <span class="truncate">{{ interview.jobTitle }}</span>
                  <a
                    v-if="interview.googleCalendarEventLink"
                    :href="interview.googleCalendarEventLink"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors shrink-0 ml-auto"
                    @click.stop
                  >
                    <Calendar class="size-2.5" />
                    Calendar
                    <ExternalLink class="size-2" />
                  </a>
                </div>
              </NuxtLink>
            </div>
          </div>

          <!-- ─── Quick actions ─── -->
          <div class="ui-panel ui-dashboard-panel shadow-xs dark:shadow-none">
            <div class="ui-panel-header ui-dashboard-panel-header flex items-center gap-2.5">
              <div class="flex items-center justify-center size-7 rounded-lg bg-surface-100 dark:bg-surface-800">
                <Zap class="size-3.5 text-surface-500 dark:text-surface-400" />
              </div>
              <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Quick Actions</h2>
            </div>

            <div class="p-2.5 space-y-0.5">
              <NuxtLink
                :to="localePath('/dashboard/jobs/new')"
                class="factory-dashboard-quick-action flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition-all no-underline"
              >
                <div class="factory-dashboard-quick-action-icon flex items-center justify-center size-8 transition-colors">
                  <Plus class="size-4" />
                </div>
                Create new job
              </NuxtLink>
              <NuxtLink
                :to="localePath('/dashboard/candidates/new')"
                class="factory-dashboard-quick-action flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition-all no-underline"
              >
                <div class="factory-dashboard-quick-action-icon flex items-center justify-center size-8 transition-colors">
                  <UserPlus class="size-4" />
                </div>
                Add candidate
              </NuxtLink>
              <NuxtLink
                :to="localePath('/dashboard/applications')"
                class="factory-dashboard-quick-action flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition-all no-underline"
              >
                <div class="factory-dashboard-quick-action-icon flex items-center justify-center size-8 transition-colors">
                  <Eye class="size-4" />
                </div>
                Review applications
              </NuxtLink>
              <NuxtLink
                :to="localePath('/dashboard/interviews')"
                class="factory-dashboard-quick-action flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition-all no-underline"
              >
                <div class="factory-dashboard-quick-action-icon flex items-center justify-center size-8 transition-colors">
                  <Calendar class="size-4" />
                </div>
                View interviews
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
