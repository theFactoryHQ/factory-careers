<script setup lang="ts">
import {
  Brain, Sparkles, TrendingUp, CheckCircle2,
  XCircle, Zap, Clock, BarChart3, Activity, AlertCircle, DollarSign,
} from 'lucide-vue-next'
import {
  getAnalysisRunStatusBadgeClass,
  getAnalysisRunStatusDotClass,
  getScoreBadgeClass,
} from '~/utils/status-display'
import type { AiUsageDay } from '~/utils/ai-usage-chart'
import {
  buildAiUsageSeries,
  formatUsageDate,
  getNiceUsageAxisMax,
  getUsageBarHeight,
} from '~/utils/ai-usage-chart'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

useSeoMeta({
  title: 'AI — Factory Careers',
  robots: 'noindex, nofollow',
})

const { locale } = useI18n()

const { data: stats, status: fetchStatus, error, refresh } = useFetch('/api/ai-analysis/stats', {
  key: 'ai-analysis-stats',
  headers: useRequestHeaders(['cookie']),
  getCachedData: getSwrCachedData,
})

watchFetchSwrStamp(stats)

const { showSkeleton, isRevalidating } = useStaleFetchUi(fetchStatus, stats)

const summary = computed(() => stats.value?.summary ?? {
  totalRuns: 0,
  completedRuns: 0,
  failedRuns: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0,
})

const pricing = computed(() => stats.value?.pricing ?? { inputPricePer1m: null, outputPricePer1m: null, configured: false })

const dailyRuns = computed(() => stats.value?.dailyRuns ?? [])
const recentRuns = computed(() => stats.value?.recentRuns ?? [])
const modelBreakdown = computed(() => stats.value?.modelBreakdown ?? [])

const successRate = computed(() => {
  if (summary.value.totalRuns === 0) return 0
  return Math.round((summary.value.completedRuns / summary.value.totalRuns) * 100)
})

// ─── Cost computations ───
function calcCost(promptTokens: number, completionTokens: number): number | null {
  const ip = pricing.value.inputPricePer1m
  const op = pricing.value.outputPricePer1m
  if (ip == null && op == null) return null
  return ((promptTokens / 1_000_000) * (ip ?? 0)) + ((completionTokens / 1_000_000) * (op ?? 0))
}

const totalCost = computed(() => calcCost(summary.value.totalPromptTokens, summary.value.totalCompletionTokens))

// Keep sparse API rows sparse at the contract boundary, then normalize the
// presentation to a real rolling calendar window for predictable chart sizing.
const fallbackUsageWindowEndDate = useState(
  'ai-usage-window-end-date',
  () => new Date().toISOString().slice(0, 10),
)
const usageWindowEndDate = computed(() =>
  stats.value?.usagePeriod.endDate ?? fallbackUsageWindowEndDate.value,
)

const usageDays = computed(() => buildAiUsageSeries(
  dailyRuns.value as AiUsageDay[],
  { endDateKey: usageWindowEndDate.value },
))

const usageTotals = computed(() => usageDays.value.reduce((totals, day) => ({
  runs: totals.runs + day.count,
  promptTokens: totals.promptTokens + day.promptTokens,
  completionTokens: totals.completionTokens + day.completionTokens,
  tokens: totals.tokens + day.promptTokens + day.completionTokens,
}), {
  runs: 0,
  promptTokens: 0,
  completionTokens: 0,
  tokens: 0,
}))

const peakDailyRuns = computed(() => Math.max(...usageDays.value.map(day => day.count), 0))
const peakDailyTokens = computed(() => Math.max(
  ...usageDays.value.map(day => day.promptTokens + day.completionTokens),
  0,
))
const runsAxisMax = computed(() => getNiceUsageAxisMax(peakDailyRuns.value))
const tokensAxisMax = computed(() => getNiceUsageAxisMax(peakDailyTokens.value))
const chartStartDate = computed(() => formatChartDate(usageDays.value[0]?.date ?? ''))
const chartMiddleDate = computed(() => formatChartDate(
  usageDays.value[Math.floor((usageDays.value.length - 1) / 2)]?.date ?? '',
))
const chartEndDate = computed(() => formatChartDate(usageDays.value.at(-1)?.date ?? ''))
const promptTokenShare = computed(() => {
  if (usageTotals.value.tokens === 0) return 0
  return Math.round((usageTotals.value.promptTokens / usageTotals.value.tokens) * 100)
})

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function formatAxisNumber(n: number): string {
  if (Number.isInteger(n)) return formatNumber(n)
  return n.toFixed(1).replace(/\.0$/, '')
}

function formatChartDate(dateKey: string): string {
  return formatUsageDate(dateKey, locale.value)
}

function formatCost(cost: number | null): string {
  if (cost == null) return '—'
  if (cost < 0.01) return '<$0.01'
  return `$${cost.toFixed(2)}`
}

function formatCostPrecise(cost: number | null): string {
  if (cost == null) return '—'
  if (cost < 0.001) return '<$0.001'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

function getDayTokenTotal(day: AiUsageDay): number {
  return day.promptTokens + day.completionTokens
}

function getPromptTokenPercentage(day: AiUsageDay): number {
  const total = getDayTokenTotal(day)
  return total === 0 ? 0 : (day.promptTokens / total) * 100
}

function getUsageDayLabel(day: AiUsageDay): string {
  const tokens = getDayTokenTotal(day)
  if (day.count === 0 && tokens === 0) {
    return `${formatChartDate(day.date)}: no usage`
  }
  return `${formatChartDate(day.date)}: ${day.count} run${day.count === 1 ? '' : 's'}, ${formatNumber(tokens)} tokens`
}

function getUsageTooltipPosition(index: number): string {
  if (index < 3) return 'left-0'
  if (index >= usageDays.value.length - 3) return 'right-0'
  return 'left-1/2 -translate-x-1/2'
}

function formatDateTime(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

</script>

<template>
  <div class="mx-auto max-w-6xl">
    <StaleRevalidateBar v-if="isRevalidating" />

    <!-- ─── Loading skeleton ─── -->
    <div v-if="showSkeleton">
      <div class="mb-10">
        <div class="h-8 w-48 bg-surface-200 dark:bg-surface-700 rounded-lg animate-pulse mb-2" />
        <div class="h-4 w-64 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div v-for="i in 4" :key="i" class="ui-dashboard-stat-card p-5 animate-pulse">
          <div class="flex items-center justify-between mb-4">
            <div class="h-3 w-20 bg-surface-200 dark:bg-surface-700 rounded" />
            <div class="size-9 bg-surface-200 dark:bg-surface-700 rounded-xl" />
          </div>
          <div class="h-9 w-14 bg-surface-200 dark:bg-surface-700 rounded mb-2" />
          <div class="h-3 w-24 bg-surface-100 dark:bg-surface-800 rounded" />
        </div>
      </div>
      <div class="space-y-6">
        <div class="ui-panel ui-dashboard-panel p-6 animate-pulse">
          <div class="h-5 w-40 bg-surface-200 dark:bg-surface-700 rounded mb-6" />
          <div class="h-24 bg-surface-100 dark:bg-surface-800 rounded-xl" />
        </div>
        <div class="ui-panel ui-dashboard-panel p-6 animate-pulse">
          <div class="h-5 w-32 bg-surface-200 dark:bg-surface-700 rounded mb-6" />
          <div class="space-y-3">
            <div v-for="i in 3" :key="i" class="h-12 bg-surface-100 dark:bg-surface-800 rounded-xl" />
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Error ─── -->
    <div
      v-else-if="error"
      class="rounded-2xl border border-danger-200 dark:border-danger-900 bg-danger-50 dark:bg-danger-950/60 p-5 text-sm text-danger-700 dark:text-danger-400 flex items-center gap-3"
    >
      <AlertCircle class="size-5 shrink-0" />
      <span>Failed to load AI analysis data.</span>
      <button class="underline ml-auto font-medium cursor-pointer" @click="refresh()">Retry</button>
    </div>

    <!-- ─── Empty state (no runs at all) ─── -->
    <div v-else-if="summary.totalRuns === 0" class="flex flex-col items-center justify-center py-24">
      <div class="rounded-3xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-14 text-center max-w-md shadow-sm">
        <div class="mx-auto mb-8 flex items-center justify-center size-18 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-lg shadow-brand-500/20">
          <Brain class="size-9 text-white" />
        </div>
        <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-3 tracking-tight">
          No AI analysis yet
        </h2>
        <p class="text-sm text-surface-500 dark:text-surface-400 mb-4 leading-relaxed max-w-sm mx-auto">
          Configure your AI provider in Settings and set up scoring criteria on a job to start analyzing candidates.
        </p>
      </div>
    </div>

    <!-- ─── Dashboard content ─── -->
    <template v-else>
      <!-- ─── Header ─── -->
      <div class="flex items-center justify-between mb-10">
        <div>
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50 tracking-tight">AI</h1>
          <p class="text-sm text-surface-400 dark:text-surface-500 mt-1">Overview of AI scoring runs and token usage</p>
        </div>
      </div>

      <!-- ─── Stat cards ─── -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        <DashboardStatCard label="Total Runs" :icon="Activity" accent="brand">
          <template #value>{{ formatNumber(summary.totalRuns) }}</template>
          <template #caption>
            <span class="flex items-center gap-3">
              <span class="flex items-center gap-1 text-success-600 dark:text-success-400">
                <CheckCircle2 class="size-3" />
                {{ summary.completedRuns }}
              </span>
              <span v-if="summary.failedRuns > 0" class="flex items-center gap-1 text-danger-600 dark:text-danger-400">
                <XCircle class="size-3" />
                {{ summary.failedRuns }}
              </span>
            </span>
          </template>
        </DashboardStatCard>

        <DashboardStatCard
          label="Success Rate"
          :icon="TrendingUp"
          accent="success"
          :value-class="successRate >= 90 ? 'text-success-600 dark:text-success-400' : successRate >= 70 ? 'text-warning-600 dark:text-warning-400' : 'text-danger-600 dark:text-danger-400'"
          :dot-class="successRate >= 90 ? 'bg-success-500' : successRate >= 70 ? 'bg-warning-500' : 'bg-danger-500'"
        >
          <template #value>{{ successRate }}%</template>
          <template #caption>{{ summary.completedRuns }} of {{ summary.totalRuns }} successful</template>
        </DashboardStatCard>

        <DashboardStatCard label="Prompt Tokens" :icon="Zap" accent="violet">
          <template #value>{{ formatNumber(summary.totalPromptTokens) }}</template>
          <template #caption>Input tokens sent</template>
        </DashboardStatCard>

        <DashboardStatCard label="Completion Tokens" :icon="Sparkles" accent="amber">
          <template #value>{{ formatNumber(summary.totalCompletionTokens) }}</template>
          <template #caption>Output tokens generated</template>
        </DashboardStatCard>

        <DashboardStatCard
          label="Total Cost"
          :icon="DollarSign"
          accent="emerald"
          card-class="col-span-2 lg:col-span-1"
          :value-class="pricing.configured ? 'text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300' : 'text-surface-300 dark:text-surface-600'"
          :dot-class="pricing.configured ? 'bg-emerald-500' : 'bg-surface-300 dark:bg-surface-600'"
        >
          <template #value>{{ pricing.configured ? formatCost(totalCost) : '—' }}</template>
          <template #caption>
            <template v-if="pricing.configured">Estimated from token usage</template>
            <template v-else>
              <NuxtLink to="/dashboard/settings/ai" class="text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 underline underline-offset-2">Set pricing</NuxtLink> to track costs
            </template>
          </template>
        </DashboardStatCard>
      </div>

      <!-- ─── Usage chart (rolling 30 days) ─── -->
      <div class="ui-panel ui-dashboard-panel mb-6">
        <div class="flex flex-col gap-4 border-b border-surface-200 px-5 py-5 dark:border-surface-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div class="flex items-center gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
              <BarChart3 class="size-5" />
            </div>
            <div>
              <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Usage</h2>
              <p class="text-sm text-surface-500 dark:text-surface-400">
                Rolling 30 days · {{ chartStartDate }}–{{ chartEndDate }}
              </p>
            </div>
          </div>

          <dl class="grid grid-cols-2 gap-x-6 rounded-lg border border-surface-200 bg-surface-50 px-4 py-2.5 dark:border-surface-800 dark:bg-surface-900/60 sm:min-w-64">
            <div>
              <dt class="text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">Runs</dt>
              <dd class="mt-0.5 text-sm font-semibold tabular-nums text-surface-900 dark:text-surface-100">{{ formatNumber(usageTotals.runs) }}</dd>
            </div>
            <div>
              <dt class="text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">Tokens</dt>
              <dd class="mt-0.5 text-sm font-semibold tabular-nums text-surface-900 dark:text-surface-100">{{ formatNumber(usageTotals.tokens) }}</dd>
            </div>
          </dl>
        </div>

        <div class="grid divide-y divide-surface-200 dark:divide-surface-800 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <section class="p-5 sm:p-6" aria-labelledby="usage-runs-title">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 id="usage-runs-title" class="text-sm font-semibold text-surface-800 dark:text-surface-200">Runs per day</h3>
                <p class="mt-0.5 text-xs text-surface-500 dark:text-surface-400">Completed, failed, and partial scoring runs</p>
              </div>
              <span class="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-medium tabular-nums text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                Peak {{ formatNumber(peakDailyRuns) }}
              </span>
            </div>

            <div class="mt-5">
              <div class="flex h-36 gap-3">
                <div class="flex w-9 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] tabular-nums text-surface-400 dark:text-surface-500" aria-hidden="true">
                  <span>{{ formatAxisNumber(runsAxisMax) }}</span>
                  <span>{{ formatAxisNumber(runsAxisMax / 2) }}</span>
                  <span>0</span>
                </div>
                <div class="relative min-w-0 flex-1">
                  <div class="pointer-events-none absolute inset-0 flex flex-col justify-between py-1" aria-hidden="true">
                    <span v-for="line in 3" :key="`runs-grid-${line}`" class="border-t border-dashed border-surface-200 dark:border-surface-800" />
                  </div>
                  <p v-if="usageTotals.runs === 0" class="absolute inset-0 flex items-center justify-center text-xs text-surface-400 dark:text-surface-500">
                    No runs in this window
                  </p>
                  <div class="absolute inset-0 flex items-end gap-px pt-1 sm:gap-0.5" role="list" aria-label="Daily AI scoring runs over the last 30 days">
                    <div
                      v-for="(day, index) in usageDays"
                      :key="day.date"
                      class="group relative flex h-full min-w-0 flex-1 items-end justify-center focus:outline-none"
                      role="listitem"
                      :aria-label="getUsageDayLabel(day)"
                      :tabindex="day.count > 0 ? 0 : undefined"
                      :title="getUsageDayLabel(day)"
                    >
                      <div
                        v-if="day.count > 0"
                        class="w-full max-w-3 rounded-t-[3px] bg-brand-500 transition-colors group-hover:bg-brand-600 group-focus-visible:ring-2 group-focus-visible:ring-brand-500 group-focus-visible:ring-offset-2 dark:bg-brand-400 dark:group-hover:bg-brand-300 dark:group-focus-visible:ring-offset-surface-900"
                        :style="{ height: `${getUsageBarHeight(day.count, runsAxisMax)}%` }"
                      />
                      <div
                        v-if="day.count > 0"
                        class="pointer-events-none absolute top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                        :class="getUsageTooltipPosition(index)"
                      >
                        <div class="whitespace-nowrap rounded-lg border border-surface-200 bg-white px-2.5 py-2 text-[11px] shadow-lg dark:border-surface-700 dark:bg-surface-800">
                          <p class="font-semibold text-surface-800 dark:text-surface-200">{{ formatChartDate(day.date) }}</p>
                          <p class="mt-0.5 text-surface-500 dark:text-surface-400">{{ day.count }} run{{ day.count === 1 ? '' : 's' }}</p>
                          <p class="text-surface-400 dark:text-surface-500">{{ formatNumber(getDayTokenTotal(day)) }} tokens</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="ml-12 mt-2 flex justify-between text-[10px] text-surface-400 dark:text-surface-500" aria-hidden="true">
                <span>{{ chartStartDate }}</span>
                <span>{{ chartMiddleDate }}</span>
                <span>{{ chartEndDate }}</span>
              </div>
            </div>
          </section>

          <section class="p-5 sm:p-6" aria-labelledby="usage-tokens-title">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 id="usage-tokens-title" class="text-sm font-semibold text-surface-800 dark:text-surface-200">Tokens per day</h3>
                <div class="mt-1 flex items-center gap-3 text-[10px] text-surface-400 dark:text-surface-500">
                  <span class="flex items-center gap-1"><span class="size-2 rounded-sm bg-violet-500 dark:bg-violet-400" /> Prompt</span>
                  <span class="flex items-center gap-1"><span class="size-2 rounded-sm bg-amber-400 dark:bg-amber-300" /> Completion</span>
                </div>
              </div>
              <span class="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium tabular-nums text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                {{ promptTokenShare }}% prompt
              </span>
            </div>

            <div class="mt-5">
              <div class="flex h-36 gap-3">
                <div class="flex w-9 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] tabular-nums text-surface-400 dark:text-surface-500" aria-hidden="true">
                  <span>{{ formatAxisNumber(tokensAxisMax) }}</span>
                  <span>{{ formatAxisNumber(tokensAxisMax / 2) }}</span>
                  <span>0</span>
                </div>
                <div class="relative min-w-0 flex-1">
                  <div class="pointer-events-none absolute inset-0 flex flex-col justify-between py-1" aria-hidden="true">
                    <span v-for="line in 3" :key="`tokens-grid-${line}`" class="border-t border-dashed border-surface-200 dark:border-surface-800" />
                  </div>
                  <p v-if="usageTotals.tokens === 0" class="absolute inset-0 flex items-center justify-center text-xs text-surface-400 dark:text-surface-500">
                    No tokens used in this window
                  </p>
                  <div class="absolute inset-0 flex items-end gap-px pt-1 sm:gap-0.5" role="list" aria-label="Daily AI token usage over the last 30 days">
                    <div
                      v-for="(day, index) in usageDays"
                      :key="`tokens-${day.date}`"
                      class="group relative flex h-full min-w-0 flex-1 items-end justify-center focus:outline-none"
                      role="listitem"
                      :aria-label="getUsageDayLabel(day)"
                      :tabindex="getDayTokenTotal(day) > 0 ? 0 : undefined"
                      :title="getUsageDayLabel(day)"
                    >
                      <div
                        v-if="getDayTokenTotal(day) > 0"
                        class="flex w-full max-w-3 flex-col-reverse overflow-hidden rounded-t-[3px] group-focus-visible:ring-2 group-focus-visible:ring-violet-500 group-focus-visible:ring-offset-2 dark:group-focus-visible:ring-offset-surface-900"
                        :style="{ height: `${getUsageBarHeight(getDayTokenTotal(day), tokensAxisMax)}%` }"
                      >
                        <div class="w-full bg-violet-500 transition-colors group-hover:bg-violet-600 dark:bg-violet-400 dark:group-hover:bg-violet-300" :style="{ height: `${getPromptTokenPercentage(day)}%` }" />
                        <div class="w-full bg-amber-400 transition-colors group-hover:bg-amber-500 dark:bg-amber-300 dark:group-hover:bg-amber-200" :style="{ height: `${100 - getPromptTokenPercentage(day)}%` }" />
                      </div>
                      <div
                        v-if="getDayTokenTotal(day) > 0"
                        class="pointer-events-none absolute top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                        :class="getUsageTooltipPosition(index)"
                      >
                        <div class="whitespace-nowrap rounded-lg border border-surface-200 bg-white px-2.5 py-2 text-[11px] shadow-lg dark:border-surface-700 dark:bg-surface-800">
                          <p class="font-semibold text-surface-800 dark:text-surface-200">{{ formatChartDate(day.date) }}</p>
                          <p class="mt-0.5 text-violet-600 dark:text-violet-400">Prompt: {{ formatNumber(day.promptTokens) }}</p>
                          <p class="text-amber-600 dark:text-amber-400">Completion: {{ formatNumber(day.completionTokens) }}</p>
                          <p v-if="pricing.configured" class="mt-1 border-t border-surface-100 pt-1 font-medium text-emerald-600 dark:border-surface-700 dark:text-emerald-400">{{ formatCostPrecise(calcCost(day.promptTokens, day.completionTokens)) }}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="ml-12 mt-2 flex justify-between text-[10px] text-surface-400 dark:text-surface-500" aria-hidden="true">
                <span>{{ chartStartDate }}</span>
                <span>{{ chartMiddleDate }}</span>
                <span>{{ chartEndDate }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- ─── Model breakdown ─── -->
      <div v-if="modelBreakdown.length > 0" class="ui-table-shell mb-6">
        <div class="px-6 py-5 border-b border-surface-200 dark:border-surface-800">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-lg bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400">
              <Sparkles class="size-5" />
            </div>
            <div>
              <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Model Breakdown</h2>
              <p class="text-sm text-surface-500 dark:text-surface-400">Usage per AI provider and model</p>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="ui-table-header">
                <th class="text-left px-4 py-3 font-medium text-surface-500 dark:text-surface-400">Provider</th>
                <th class="text-left px-4 py-3 font-medium text-surface-500 dark:text-surface-400">Model</th>
                <th class="text-right px-4 py-3 font-medium text-surface-500 dark:text-surface-400">Runs</th>
                <th class="text-right px-4 py-3 font-medium text-surface-500 dark:text-surface-400 hidden md:table-cell">Prompt</th>
                <th class="text-right px-4 py-3 font-medium text-surface-500 dark:text-surface-400 hidden md:table-cell">Completion</th>
                <th class="text-right px-4 py-3 font-medium text-surface-500 dark:text-surface-400">Total Tokens</th>
                <th v-if="pricing.configured" class="text-right px-4 py-3 font-medium text-surface-500 dark:text-surface-400">Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in modelBreakdown"
                :key="`${m.provider}-${m.model}`"
                class="ui-table-row"
              >
                <td class="px-4 py-3 font-medium text-surface-700 dark:text-surface-300 capitalize">{{ m.provider }}</td>
                <td class="px-4 py-3">
                  <code class="rounded bg-surface-100 px-1.5 py-0.5 text-xs font-mono text-surface-700 dark:bg-surface-800 dark:text-surface-300">{{ m.model }}</code>
                </td>
                <td class="px-4 py-3 text-right tabular-nums text-surface-700 dark:text-surface-300">{{ m.runCount }}</td>
                <td class="px-4 py-3 text-right tabular-nums text-violet-600 dark:text-violet-400 hidden md:table-cell">{{ formatNumber(m.totalPromptTokens) }}</td>
                <td class="px-4 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400 hidden md:table-cell">{{ formatNumber(m.totalCompletionTokens) }}</td>
                <td class="px-4 py-3 text-right tabular-nums font-semibold text-surface-800 dark:text-surface-200">{{ formatNumber(m.totalTokens) }}</td>
                <td v-if="pricing.configured" class="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{{ formatCost(calcCost(m.totalPromptTokens, m.totalCompletionTokens)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ─── Recent runs ─── -->
      <div class="ui-table-shell">
        <div class="px-6 py-5 border-b border-surface-200 dark:border-surface-800">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-lg bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400">
              <Clock class="size-5" />
            </div>
            <div>
              <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Recent Runs</h2>
              <p class="text-sm text-surface-500 dark:text-surface-400">Latest AI scoring activity</p>
            </div>
          </div>
        </div>

        <div v-if="recentRuns.length === 0" class="p-16 text-center">
          <Brain class="size-10 text-surface-300 dark:text-surface-600 mx-auto mb-3" />
          <h3 class="text-base font-semibold text-surface-700 dark:text-surface-200 mb-1">No AI analysis runs yet</h3>
          <p class="text-sm text-surface-500 dark:text-surface-400">
            Runs will appear here once you score candidates.
          </p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="ui-table-header">
                <th class="text-left px-4 py-3 font-medium text-surface-500 dark:text-surface-400">Status</th>
                <th class="text-left px-4 py-3 font-medium text-surface-500 dark:text-surface-400">Candidate</th>
                <th class="text-left px-4 py-3 font-medium text-surface-500 dark:text-surface-400 hidden lg:table-cell">Job</th>
                <th class="text-right px-4 py-3 font-medium text-surface-500 dark:text-surface-400">Score</th>
                <th class="text-left px-4 py-3 font-medium text-surface-500 dark:text-surface-400 hidden md:table-cell">Model</th>
                <th class="text-right px-4 py-3 font-medium text-surface-500 dark:text-surface-400 hidden md:table-cell">Tokens</th>
                <th v-if="pricing.configured" class="text-right px-4 py-3 font-medium text-surface-500 dark:text-surface-400 hidden md:table-cell">Cost</th>
                <th class="text-right px-4 py-3 font-medium text-surface-500 dark:text-surface-400">Date</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="run in recentRuns"
                :key="run.id"
                class="ui-table-row"
              >
                <td class="px-4 py-3">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize whitespace-nowrap"
                    :class="getAnalysisRunStatusBadgeClass(run.status)"
                  >
                    <span
                      class="size-1.5 rounded-full"
                      :class="getAnalysisRunStatusDotClass(run.status)"
                    />
                    {{ run.status }}
                  </span>
                </td>
                <td class="px-4 py-3 font-semibold text-surface-900 dark:text-surface-100 max-w-[160px] truncate">
                  {{ run.candidateName }}
                </td>
                <td class="px-4 py-3 text-surface-500 dark:text-surface-400 max-w-[160px] truncate hidden lg:table-cell">
                  {{ run.jobTitle }}
                </td>
                <td class="px-4 py-3 text-right">
                  <span
                    v-if="run.compositeScore != null"
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset"
                    :class="getScoreBadgeClass(run.compositeScore, 'subtle')"
                  >
                    {{ run.compositeScore }}
                  </span>
                  <span v-else class="text-surface-400">—</span>
                </td>
                <td class="px-4 py-3 hidden md:table-cell">
                  <code class="rounded bg-surface-100 px-1.5 py-0.5 text-[11px] font-mono text-surface-600 dark:bg-surface-800 dark:text-surface-400">{{ run.model }}</code>
                </td>
                <td class="px-4 py-3 text-right tabular-nums text-surface-600 dark:text-surface-400 hidden md:table-cell">
                  <span v-if="run.promptTokens != null">
                    {{ formatNumber((run.promptTokens ?? 0) + (run.completionTokens ?? 0)) }}
                  </span>
                  <span v-else>—</span>
                </td>
                <td v-if="pricing.configured" class="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 hidden md:table-cell">
                  <span v-if="run.promptTokens != null">{{ formatCostPrecise(calcCost(run.promptTokens ?? 0, run.completionTokens ?? 0)) }}</span>
                  <span v-else>—</span>
                </td>
                <td class="px-4 py-3 text-right text-xs text-surface-500 dark:text-surface-400 whitespace-nowrap">
                  {{ formatDateTime(run.createdAt) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
