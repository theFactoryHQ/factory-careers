<script setup lang="ts">
/**
 * Settings → AI
 *
 * Lists every saved AI configuration as a card. Adding/editing now happens on
 * dedicated pages (`./new` and `./[id]`) for a calmer, less dense experience.
 */
import {
  Brain, Plus, Loader2, AlertTriangle, Sparkles, BarChart3, Star,
  Pencil, Trash2, Zap, Check, KeyRound, Server,
} from 'lucide-vue-next'

definePageMeta({})

useSeoMeta({
  title: 'AI Configuration — Factory Careers',
  description: 'Configure AI providers and models for the chatbot and candidate analysis.',
})

interface AiConfigRow {
  id: string
  name: string
  provider: string
  model: string
  baseUrl: string | null
  maxTokens: number
  inputPricePer1m: number | null
  outputPricePer1m: number | null
  isDefaultChatbot: boolean
  isDefaultAnalysis: boolean
  hasApiKey: boolean
  createdAt?: string | Date
  updatedAt?: string | Date
}

interface ProviderInfo {
  name: string
  tagline: string
  modelsUrl: string
  apiKeyUrl: string
  signupUrl?: string
  supportsBaseUrl: boolean
  defaultModel: string
  models: { id: string, label: string, description: string, inputPricePer1m?: number, outputPricePer1m?: number, badge?: 'recommended' | 'fast' | 'powerful' | 'cheap' }[]
}

const { allowed: canManageAi, isLoading: isPermissionLoading } = usePermission({ scoring: ['create'] })
const toast = useToast()

const { data: configsData, refresh: refreshConfigs, status: configsStatus } = useFetch<AiConfigRow[]>('/api/ai-config', {
  key: 'ai-configs',
  headers: useRequestHeaders(['cookie']),
  default: () => [],
})

const { data: providers } = useFetch<Record<string, ProviderInfo>>('/api/ai-config/providers', {
  key: 'ai-providers',
  headers: useRequestHeaders(['cookie']),
})

const configs = computed(() => configsData.value ?? [])
const isLoading = computed(() => configsStatus.value === 'pending' && configs.value.length === 0)

// ── Per-row actions ──
const togglingDefaultId = ref<string | null>(null)
const togglingPurpose = ref<'chatbot' | 'analysis' | null>(null)
async function setDefault(c: AiConfigRow, purpose: 'chatbot' | 'analysis') {
  togglingDefaultId.value = c.id
  togglingPurpose.value = purpose
  try {
    await $fetch(`/api/ai-config/${c.id}/set-default`, {
      method: 'POST',
      body: { purposes: [purpose] },
      headers: useRequestHeaders(['cookie']),
    })
    toast.success(`Set as default for ${purpose === 'chatbot' ? 'chatbot' : 'analysis'}`, `"${c.name}" will now be used.`)
    await refreshConfigs()
  } catch (err: any) {
    const message = err?.data?.statusMessage ?? 'Failed to set default.'
    toast.error('Could not change default', { message })
  } finally {
    togglingDefaultId.value = null
    togglingPurpose.value = null
  }
}

const testingId = ref<string | null>(null)
const testResults = ref<Record<string, { success: boolean, message?: string }>>({})
async function testConnection(c: AiConfigRow) {
  testingId.value = c.id
  delete testResults.value[c.id]
  try {
    await $fetch(`/api/ai-config/${c.id}/test-connection`, {
      method: 'POST',
      headers: useRequestHeaders(['cookie']),
    })
    testResults.value = { ...testResults.value, [c.id]: { success: true } }
    toast.success('Connection works', `"${c.name}" responded correctly.`)
  } catch (err: any) {
    const message = err?.data?.statusMessage ?? 'Connection test failed.'
    testResults.value = { ...testResults.value, [c.id]: { success: false, message } }
    toast.error('Test failed', { message })
  } finally {
    testingId.value = null
  }
}

const deletingId = ref<string | null>(null)
async function deleteConfig(c: AiConfigRow) {
  if (!confirm(`Delete the "${c.name}" configuration? Conversations using it will fall back to the default.`)) return
  deletingId.value = c.id
  try {
    await $fetch(`/api/ai-config/${c.id}`, {
      method: 'DELETE',
      headers: useRequestHeaders(['cookie']),
    })
    toast.success('Configuration deleted', `"${c.name}" removed.`)
    await refreshConfigs()
  } catch (err: any) {
    const message = err?.data?.statusMessage ?? 'Failed to delete configuration.'
    toast.error('Delete failed', { message })
  } finally {
    deletingId.value = null
  }
}

function providerLabel(key: string): string {
  return providers.value?.[key]?.name ?? key
}
function formatPrice(p: number | null): string {
  if (p == null) return '—'
  return `$${p.toFixed(2)}`
}
</script>

<template>
  <div class="ui-settings-page ui-settings-page-wide">
    <!-- Page header -->
    <div class="ui-settings-page-header ui-settings-page-header-split">
      <div>
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">AI Configuration</h1>
        <p class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
          Add as many providers and models as you like. Pick which one powers the chatbot and which one scores candidates.
        </p>
      </div>
      <NuxtLink
        v-if="canManageAi"
        to="/dashboard/settings/ai/new"
        class="ui-button ui-button-primary px-3 py-1.5"
      >
        <Plus class="size-4" />
        Add a model
      </NuxtLink>
    </div>

    <!-- Permission guard -->
    <div v-if="isPermissionLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-6 animate-spin text-surface-400" />
    </div>

    <div
      v-else-if="!canManageAi"
      class="ui-alert ui-alert-warning p-5 flex items-start gap-3"
    >
      <AlertTriangle class="size-5 shrink-0 mt-0.5" />
      <div>
        <p class="font-semibold mb-1">Insufficient permissions</p>
        <p>You don't have permission to manage AI settings. Contact your organization owner or admin.</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-else-if="isLoading" class="ui-panel ui-dashboard-panel ui-settings-panel-body text-center text-sm text-surface-500">
      <Loader2 class="size-5 animate-spin mx-auto mb-2 text-surface-400" />
      Loading configurations…
    </div>

    <!-- Empty state -->
    <div
      v-else-if="configs.length === 0"
      class="ui-empty-panel ui-empty-panel-dashed p-10"
    >
      <div class="ui-icon-state ui-dashboard-soft-icon ui-icon-state-brand ui-icon-tile mx-auto size-12 mb-3">
        <Brain class="size-6" />
      </div>
      <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">No AI models configured yet</h2>
      <p class="mt-1 mb-4 text-sm text-surface-500 dark:text-surface-400">
        Add your first model to enable the chatbot and candidate analysis. Pick from popular providers or bring your own OpenAI-compatible endpoint.
      </p>
      <NuxtLink
        to="/dashboard/settings/ai/new"
        class="ui-button ui-button-primary"
      >
        <Plus class="size-4" />
        Add your first model
      </NuxtLink>
    </div>

    <!-- Config cards -->
    <ul v-else class="space-y-3">
      <li
        v-for="c in configs"
        :key="c.id"
        class="ui-panel ui-dashboard-panel ui-settings-panel"
      >
        <div class="ui-settings-panel-body flex flex-col sm:flex-row sm:items-start gap-4">
          <!-- Identity -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 truncate">{{ c.name }}</h3>
              <span class="ui-pill rounded-full px-2 py-0.5 text-[11px]">
                {{ providerLabel(c.provider) }}
              </span>
              <span
                v-if="c.isDefaultChatbot"
                class="ui-pill ui-pill-brand rounded-full px-2 py-0.5 text-[11px]"
                title="Default for the chatbot"
              >
                <Sparkles class="size-3" /> Chatbot default
              </span>
              <span
                v-if="c.isDefaultAnalysis"
                class="ui-pill ui-pill-warning rounded-full px-2 py-0.5 text-[11px]"
                title="Default for candidate analysis"
              >
                <Star class="size-3" /> Analysis default
              </span>
              <span
                v-if="!c.hasApiKey"
                class="ui-pill ui-pill-danger rounded-full px-2 py-0.5 text-[11px]"
              >
                <AlertTriangle class="size-3" /> Missing API key
              </span>
            </div>
            <div class="mt-1 flex items-center gap-2 flex-wrap text-xs text-surface-500">
              <span class="font-mono">{{ c.model }}</span>
              <span v-if="c.baseUrl" class="inline-flex items-center gap-1">
                <Server class="size-3" />
                <span class="font-mono truncate max-w-[260px]" :title="c.baseUrl">{{ c.baseUrl }}</span>
              </span>
              <span class="inline-flex items-center gap-1" title="Pricing per 1M tokens">
                <BarChart3 class="size-3" />
                {{ formatPrice(c.inputPricePer1m) }} in / {{ formatPrice(c.outputPricePer1m) }} out
              </span>
            </div>

            <div v-if="testResults[c.id]" class="mt-2">
              <span
                v-if="testResults[c.id]?.success"
                class="ui-feedback-success text-[11px]"
              >
                <Check class="size-3" /> Connection verified.
              </span>
              <span
                v-else
                class="ui-feedback-danger items-start text-[11px]"
              >
                <AlertTriangle class="size-3 mt-px" /> {{ testResults[c.id]?.message }}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              v-if="!c.isDefaultChatbot"
              :disabled="!c.hasApiKey || (togglingDefaultId === c.id && togglingPurpose === 'chatbot')"
              class="ui-button ui-button-secondary px-2.5 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              :title="c.hasApiKey ? 'Use this model for the chatbot' : 'Add an API key first'"
              @click="setDefault(c, 'chatbot')"
            >
              <Loader2 v-if="togglingDefaultId === c.id && togglingPurpose === 'chatbot'" class="size-3.5 animate-spin" />
              <Sparkles v-else class="size-3.5" />
              Use for chatbot
            </button>

            <button
              v-if="!c.isDefaultAnalysis"
              :disabled="!c.hasApiKey || (togglingDefaultId === c.id && togglingPurpose === 'analysis')"
              class="ui-button ui-button-secondary px-2.5 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              :title="c.hasApiKey ? 'Use this model for candidate analysis' : 'Add an API key first'"
              @click="setDefault(c, 'analysis')"
            >
              <Loader2 v-if="togglingDefaultId === c.id && togglingPurpose === 'analysis'" class="size-3.5 animate-spin" />
              <Star v-else class="size-3.5" />
              Use for analysis
            </button>

            <button
              :disabled="testingId === c.id || !c.hasApiKey"
              class="ui-button ui-button-secondary px-2.5 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              @click="testConnection(c)"
            >
              <Loader2 v-if="testingId === c.id" class="size-3.5 animate-spin" />
              <Zap v-else class="size-3.5" />
              Test
            </button>

            <NuxtLink
              :to="`/dashboard/settings/ai/${c.id}`"
              class="ui-button ui-button-secondary px-2.5 py-1.5 text-xs"
            >
              <Pencil class="size-3.5" />
              Edit
            </NuxtLink>

            <button
              :disabled="deletingId === c.id"
              class="ui-button ui-button-danger-outline px-2.5 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              @click="deleteConfig(c)"
            >
              <Loader2 v-if="deletingId === c.id" class="size-3.5 animate-spin" />
              <Trash2 v-else class="size-3.5" />
            </button>
          </div>
        </div>
      </li>
    </ul>

    <!-- Footer hint -->
    <p v-if="canManageAi && configs.length > 0" class="mt-4 text-xs text-surface-500 dark:text-surface-400 flex items-start gap-1.5">
      <KeyRound class="size-3.5 mt-0.5 shrink-0" />
      <span>API keys are encrypted at rest with AES-256-GCM and never returned to the browser. Need a free key? OpenAI, Anthropic, and Google all offer trial credits.</span>
    </p>
  </div>
</template>
