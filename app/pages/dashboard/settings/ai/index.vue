<script setup lang="ts">
/**
 * Settings → AI
 *
 * Lists every saved AI configuration as a card. Adding/editing now happens on
 * dedicated pages (`./new` and `./[id]`) for a calmer, less dense experience.
 */
import {
  Brain, Plus, Loader2, AlertTriangle, Sparkles, DollarSign, Star,
  Pencil, Trash2, Zap, Check, Server,
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
  catalogRefreshedAt?: string
  catalogCacheExpiresAt?: string
  catalogError?: string
  models: {
    id: string
    label: string
    description: string
    inputPricePer1m?: number
    outputPricePer1m?: number
    badge?: 'recommended' | 'fast' | 'powerful' | 'cheap'
    availability?: 'curated' | 'available' | 'not_returned' | 'discovered'
    stale?: boolean
    replacementId?: string
    maxInputTokens?: number
    maxOutputTokens?: number
  }[]
}

const { allowed: canManageAi, isLoading: isPermissionLoading } = usePermission({ aiConfig: ['create'] })
const { allowed: canUpdateOrg } = usePermission({ organization: ['update'] })
const toast = useToast()
const { analysisContext, updateSettings } = useOrgSettings()

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

const localAnalysisContext = ref('')
const lastSavedAnalysisContext = ref('')
const isSavingAnalysisContext = ref(false)
const analysisContextSaveStatus = ref<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
const analysisContextSaveError = ref('')
let analysisContextSaveTimer: ReturnType<typeof setTimeout> | null = null

watch(analysisContext, (context) => {
  lastSavedAnalysisContext.value = context
  if (analysisContextSaveStatus.value !== 'dirty' && analysisContextSaveStatus.value !== 'saving') {
    localAnalysisContext.value = context
  }
}, { immediate: true })

watch(localAnalysisContext, () => {
  scheduleAnalysisContextSave()
})

watch(canUpdateOrg, (allowed) => {
  if (allowed) scheduleAnalysisContextSave()
})

onBeforeUnmount(() => {
  if (analysisContextSaveTimer) clearTimeout(analysisContextSaveTimer)
})

function scheduleAnalysisContextSave() {
  if (analysisContextSaveTimer) clearTimeout(analysisContextSaveTimer)

  analysisContextSaveError.value = ''
  if (localAnalysisContext.value === lastSavedAnalysisContext.value) {
    analysisContextSaveStatus.value = 'idle'
    return
  }

  analysisContextSaveStatus.value = 'dirty'
  if (!canUpdateOrg.value) return

  analysisContextSaveTimer = setTimeout(() => {
    void saveAnalysisContext()
  }, 900)
}

async function saveAnalysisContext() {
  if (!canUpdateOrg.value) return
  if (analysisContextSaveTimer) {
    clearTimeout(analysisContextSaveTimer)
    analysisContextSaveTimer = null
  }

  const contextToSave = localAnalysisContext.value
  if (contextToSave === lastSavedAnalysisContext.value) {
    analysisContextSaveStatus.value = 'idle'
    return
  }

  isSavingAnalysisContext.value = true
  analysisContextSaveStatus.value = 'saving'
  try {
    await updateSettings({ analysisContext: contextToSave })
    lastSavedAnalysisContext.value = contextToSave
    analysisContextSaveStatus.value = localAnalysisContext.value === contextToSave ? 'saved' : 'dirty'
    if (localAnalysisContext.value !== contextToSave) scheduleAnalysisContextSave()
  }
  catch (err: any) {
    const message = err?.data?.statusMessage ?? err?.message ?? 'Failed to save org context.'
    analysisContextSaveStatus.value = 'error'
    analysisContextSaveError.value = message
    toast.error('Save failed', { message })
  }
  finally {
    isSavingAnalysisContext.value = false
  }
}

const analysisContextSaveLabel = computed(() => {
  if (!canUpdateOrg.value) return 'View only'
  switch (analysisContextSaveStatus.value) {
    case 'dirty': return 'Unsaved changes'
    case 'saving': return 'Saving...'
    case 'saved': return 'Saved'
    case 'error': return analysisContextSaveError.value || 'Save failed'
    default: return 'Autosaves'
  }
})

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

function modelMeta(c: AiConfigRow) {
  return providers.value?.[c.provider]?.models.find(model => model.id === c.model) ?? null
}

function formatPrice(p: number | null): string {
  if (p == null) return '—'
  return `$${p.toFixed(2)}`
}

function pricingTitle(c: AiConfigRow): string {
  return `Pricing per 1M tokens: ${formatPrice(c.inputPricePer1m)} input / ${formatPrice(c.outputPricePer1m)} output`
}

function modelTitle(c: AiConfigRow): string {
  return `${c.name}: ${c.model}`
}
</script>

<template>
  <div class="w-full">
    <!-- Page header -->
    <div class="mb-6">
      <div>
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">AI Configuration</h1>
      </div>
    </div>

    <section
      v-if="!isPermissionLoading && canManageAi"
      class="mb-5 space-y-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Org Context</h2>
        <p
          class="inline-flex items-center gap-1.5 text-[11px]"
          :class="analysisContextSaveStatus === 'error'
            ? 'text-danger-500 dark:text-danger-400'
            : analysisContextSaveStatus === 'dirty'
              ? 'text-warning-500 dark:text-warning-400'
              : 'text-surface-500 dark:text-surface-400'"
        >
          <Loader2 v-if="isSavingAnalysisContext" class="size-3 animate-spin" />
          <Check v-else-if="analysisContextSaveStatus === 'saved'" class="size-3" />
          <AlertTriangle v-else-if="analysisContextSaveStatus === 'error'" class="size-3" />
          {{ analysisContextSaveLabel }}
        </p>
      </div>
      <div class="ui-panel ui-dashboard-panel px-5 py-4 space-y-3">
        <textarea
          v-model="localAnalysisContext"
          :disabled="!canUpdateOrg"
          rows="5"
          maxlength="4000"
          class="ui-field min-h-32 resize-y disabled:opacity-60 disabled:cursor-not-allowed"
          placeholder="Describe the org, customers, services, and domain signals candidates should be evaluated against."
        />
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-[11px] text-surface-500 dark:text-surface-400">
            {{ localAnalysisContext.length.toLocaleString() }} / 4,000 characters
          </p>
        </div>
      </div>
    </section>

    <!-- Permission guard -->
    <div v-if="isPermissionLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-6 animate-spin text-surface-400" />
    </div>

    <div
      v-else-if="!canManageAi"
      class="ui-alert ui-alert-warning ui-settings-route-alert"
    >
      <AlertTriangle class="size-5 shrink-0 mt-0.5" />
      <div>
        <p class="font-semibold mb-1">Insufficient permissions</p>
        <p>You don't have permission to manage AI settings. Contact your organization owner or admin.</p>
      </div>
    </div>

    <section v-else class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Models</h2>
        </div>
        <div v-if="canManageAi" class="flex flex-wrap items-center gap-2">
          <NuxtLink
            to="/dashboard/settings/ai/new"
            class="ui-button ui-button-primary h-9 px-3.5 text-xs no-underline"
          >
            <Plus class="size-4" />
            Add a model
          </NuxtLink>
        </div>
      </div>

    <!-- Loading -->
      <div v-if="isLoading" class="ui-panel ui-dashboard-panel p-8 text-center text-sm text-surface-500">
        <Loader2 class="size-5 animate-spin mx-auto mb-2 text-surface-400" />
        Loading configurations…
      </div>

    <!-- Empty state -->
      <div
        v-else-if="configs.length === 0"
        class="ui-empty-panel ui-empty-panel-dashed ui-settings-empty-panel"
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
          class="ui-panel ui-dashboard-panel overflow-hidden"
        >
          <div class="px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-4">
          <!-- Identity -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h3
                class="text-base font-semibold text-surface-900 dark:text-surface-100 truncate"
                :title="modelTitle(c)"
              >
                {{ c.name }}
              </h3>
              <span
                class="inline-flex size-6 items-center justify-center rounded border border-surface-200 bg-surface-50 text-surface-700 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-300"
                :title="providerLabel(c.provider)"
                :aria-label="providerLabel(c.provider)"
              >
                <AiProviderLogo :provider="c.provider" class="max-h-3.5 max-w-4" />
              </span>
              <span
                v-if="c.isDefaultChatbot"
                class="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-950/50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:text-brand-300"
                title="Default for the chatbot"
              >
                <Sparkles class="size-3" /> Chatbot default
              </span>
              <span
                v-if="c.isDefaultAnalysis"
                class="inline-flex items-center gap-1 rounded-full bg-warning-50 dark:bg-warning-950/50 px-2 py-0.5 text-[11px] font-medium text-warning-700 dark:text-warning-300"
                title="Default for candidate analysis"
              >
                <Star class="size-3" /> Analysis default
              </span>
              <span
                v-if="!c.hasApiKey"
                class="inline-flex items-center gap-1 rounded-full bg-danger-50 dark:bg-danger-950/50 px-2 py-0.5 text-[11px] font-medium text-danger-700 dark:text-danger-300"
              >
                <AlertTriangle class="size-3" /> Missing API key
              </span>
              <span
                v-if="modelMeta(c)?.stale"
                class="inline-flex items-center gap-1 bg-brand-500/10 px-2 py-0.5 text-[11px] font-medium text-brand-300"
                title="The provider model-list API did not return this configured model on the latest refresh."
              >
                <AlertTriangle class="size-3" />
                {{ modelMeta(c)?.replacementId ? `Try ${modelMeta(c)?.replacementId}` : 'Not returned by provider' }}
              </span>
            </div>
            <div class="mt-1 flex items-center gap-2 flex-wrap text-xs text-surface-500">
              <span v-if="c.baseUrl" class="inline-flex items-center gap-1">
                <Server class="size-3" />
                <span class="font-mono truncate max-w-[260px]" :title="c.baseUrl">{{ c.baseUrl }}</span>
              </span>
              <span
                v-if="c.inputPricePer1m != null || c.outputPricePer1m != null"
                class="inline-flex size-4 items-center justify-center rounded border border-surface-200 bg-surface-50 text-surface-500 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-400"
                :title="pricingTitle(c)"
                :aria-label="pricingTitle(c)"
              >
                <DollarSign class="size-3" />
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
    </section>

  </div>
</template>
