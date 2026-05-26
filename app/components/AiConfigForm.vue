<script setup lang="ts">
/**
 * AiConfigForm
 *
 * Full-page form used by both the "Add a model" and "Edit model" pages.
 * Designed to be calm and progressive: each step lives in its own card,
 * advanced fields (output tokens, pricing) are collapsed by default, and
 * the API key panel only nudges users with the help they actually need.
 */
import {
  Sparkles, Eye, EyeOff, ExternalLink, Loader2, Check,
  Save, Zap, Star, AlertTriangle, ChevronDown, RefreshCw,
} from 'lucide-vue-next'

interface ModelInfo {
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
}

interface ProviderInfo {
  name: string
  tagline: string
  modelsUrl: string
  apiKeyUrl: string
  signupUrl?: string
  supportsBaseUrl: boolean
  defaultModel: string
  models: ModelInfo[]
}

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
}

const props = defineProps<{
  /** Existing config when editing; null when creating. */
  config: AiConfigRow | null
  providers: Record<string, ProviderInfo> | null
  /** True if no other configs exist yet — first save auto-claims both default slots. */
  isFirst: boolean
}>()

const emit = defineEmits<{
  saved: []
  cancel: []
}>()

const toast = useToast()

const isEdit = computed(() => props.config !== null)
const localProviders = ref<Record<string, ProviderInfo> | null>(props.providers)
const availableProviders = computed(() => localProviders.value ?? props.providers)

watch(() => props.providers, (providers) => {
  localProviders.value = providers
})

const DEFAULT_MAX_TOKENS = 16384

const form = ref({
  name: props.config?.name ?? '',
  provider: props.config?.provider ?? 'openai',
  model: props.config?.model ?? '',
  apiKey: '',
  baseUrl: props.config?.baseUrl ?? '',
  maxTokens: props.config?.maxTokens ?? DEFAULT_MAX_TOKENS,
  inputPricePer1m: props.config?.inputPricePer1m ?? null as number | null,
  outputPricePer1m: props.config?.outputPricePer1m ?? null as number | null,
  isDefaultChatbot: !isEdit.value && props.isFirst,
  isDefaultAnalysis: !isEdit.value && props.isFirst,
})

// When creating, pre-pick the first model of the default provider.
if (!isEdit.value && availableProviders.value) {
  const provKey = availableProviders.value.openai ? 'openai' : Object.keys(availableProviders.value)[0] ?? 'openai'
  const provInfo = availableProviders.value[provKey]
  const firstModel = provInfo?.models[0]
  form.value.provider = provKey
  if (firstModel) {
    form.value.model = firstModel.id
    form.value.name = firstModel.label
    form.value.inputPricePer1m = firstModel.inputPricePer1m ?? null
    form.value.outputPricePer1m = firstModel.outputPricePer1m ?? null
  }
}

const showApiKey = ref(false)
const showAdvanced = ref(false)
const isSaving = ref(false)
const isTesting = ref(false)
const isRefreshingModels = ref(false)
const testResult = ref<{ success: boolean, message?: string } | null>(null)

const selectedProvider = computed<ProviderInfo | null>(() =>
  availableProviders.value?.[form.value.provider] ?? null,
)

const selectedModel = computed<ModelInfo | null>(() =>
  selectedProvider.value?.models.find(m => m.id === form.value.model) ?? null,
)

const isCustomProvider = computed(() => form.value.provider === 'openai_compatible')

function pickModel(m: ModelInfo) {
  form.value.model = m.id
  form.value.inputPricePer1m = m.inputPricePer1m ?? form.value.inputPricePer1m
  form.value.outputPricePer1m = m.outputPricePer1m ?? form.value.outputPricePer1m
  // Auto-set the friendly name only if the user hasn't customised it.
  if (!form.value.name || /^(GPT|Claude|Gemini|Grok|Llama|Mistral|New configuration)/i.test(form.value.name)) {
    form.value.name = m.label
  }
}

function pickModelById(modelId: string) {
  const match = selectedProvider.value?.models.find(m => m.id === modelId)
  if (match) {
    pickModel(match)
    return
  }
  form.value.model = modelId
}

function onModelSelect(modelId: string) {
  pickModelById(modelId)
}

function pickProvider(key: string) {
  form.value.provider = key
  const first = availableProviders.value?.[key]?.models[0]
  if (first) {
    pickModel(first)
  }
  else {
    form.value.model = ''
    form.value.inputPricePer1m = null
    form.value.outputPricePer1m = null
  }
}

async function refreshModelCatalog() {
  isRefreshingModels.value = true
  try {
    const result = await $fetch<{
      providers: Record<string, ProviderInfo>
      refreshedProviders: Array<{ provider: string, modelCount: number }>
      errors: Array<{ provider: string, message: string }>
    }>('/api/ai-config/providers/refresh', {
      method: 'POST',
      body: { force: true },
      headers: useRequestHeaders(['cookie']),
    })
    localProviders.value = result.providers

    if (result.refreshedProviders.length > 0) {
      toast.success(
        'Model catalog refreshed',
        `${result.refreshedProviders.length} provider${result.refreshedProviders.length === 1 ? '' : 's'} updated.`,
      )
    }
    else if (result.errors.length > 0) {
      toast.error('Refresh did not complete', { message: result.errors[0]?.message ?? 'No provider models were refreshed.' })
    }
    else {
      toast.info('No providers refreshed', 'Add a provider API key before refreshing the model catalog.')
    }
  }
  catch (err: any) {
    const message = err?.data?.statusMessage ?? err?.message ?? 'Failed to refresh model catalog.'
    toast.error('Refresh failed', { message })
  }
  finally {
    isRefreshingModels.value = false
  }
}

const canSave = computed(() => {
  if (!form.value.name.trim()) return false
  if (!form.value.model.trim()) return false
  if (!isEdit.value && !form.value.apiKey) return false
  if (isCustomProvider.value && !form.value.baseUrl) return false
  return true
})

async function handleSave() {
  if (!canSave.value) return
  isSaving.value = true
  try {
    const body: Record<string, unknown> = {
      name: form.value.name.trim(),
      provider: form.value.provider,
      model: form.value.model.trim(),
      maxTokens: form.value.maxTokens,
      inputPricePer1m: form.value.inputPricePer1m,
      outputPricePer1m: form.value.outputPricePer1m,
    }
    if (isCustomProvider.value) body.baseUrl = form.value.baseUrl
    if (form.value.apiKey) body.apiKey = form.value.apiKey

    if (isEdit.value && props.config) {
      await $fetch(`/api/ai-config/${props.config.id}`, {
        method: 'PATCH',
        body,
        headers: useRequestHeaders(['cookie']),
      })
      toast.success('Configuration updated', `"${form.value.name.trim()}" saved.`)
    }
    else {
      body.isDefaultChatbot = form.value.isDefaultChatbot
      body.isDefaultAnalysis = form.value.isDefaultAnalysis
      await $fetch('/api/ai-config', {
        method: 'POST',
        body,
        headers: useRequestHeaders(['cookie']),
      })
      toast.success('Configuration added', `"${form.value.name.trim()}" is ready to use.`)
    }
    emit('saved')
  }
  catch (err: any) {
    const message = err?.data?.statusMessage ?? err?.message ?? 'Failed to save configuration.'
    toast.error('Save failed', { message })
  }
  finally {
    isSaving.value = false
  }
}

async function handleTest() {
  if (!isEdit.value || !props.config) {
    toast.info('Save first', 'Save the configuration before testing the connection.')
    return
  }
  isTesting.value = true
  testResult.value = null
  try {
    await $fetch(`/api/ai-config/${props.config.id}/test-connection`, {
      method: 'POST',
      headers: useRequestHeaders(['cookie']),
    })
    testResult.value = { success: true }
    toast.success('Connection works', 'Provider responded correctly.')
  }
  catch (err: any) {
    const message = err?.data?.statusMessage ?? err?.message ?? 'Connection test failed.'
    testResult.value = { success: false, message }
    toast.error('Test failed', { message })
  }
  finally {
    isTesting.value = false
  }
}

const badgeLabel = (badge?: ModelInfo['badge']) => {
  switch (badge) {
    case 'recommended': return 'Recommended'
    case 'fast': return 'Fast'
    case 'powerful': return 'Powerful'
    case 'cheap': return 'Low cost'
    default: return ''
  }
}

function modelOptionLabel(model: ModelInfo) {
  const labels = [badgeLabel(model.badge)]
  if (model.availability === 'discovered') labels.push('New')
  if (model.stale) labels.push(model.replacementId ? `Try ${model.replacementId}` : 'Not returned')
  const suffix = labels.filter(Boolean).join(', ')
  return suffix ? `${model.label} - ${suffix}` : model.label
}

function modelPriceLabel(model: ModelInfo | null) {
  if (!model) return ''
  const parts: string[] = []
  if (model.inputPricePer1m != null || model.outputPricePer1m != null) {
    parts.push(`$${model.inputPricePer1m?.toFixed(2) ?? '-'} in · $${model.outputPricePer1m?.toFixed(2) ?? '-'} out / 1M tokens`)
  }
  if (model.maxInputTokens != null) {
    parts.push(`${model.maxInputTokens.toLocaleString()} input tokens`)
  }
  if (model.maxOutputTokens != null) {
    parts.push(`${model.maxOutputTokens.toLocaleString()} output tokens`)
  }
  return parts.join(' · ')
}

function providerShortName(key: string, name: string) {
  return key === 'openai_compatible' ? 'Custom' : name
}
</script>

<template>
  <div class="w-full pb-32">
    <!-- Header -->
    <div class="mb-6">
      <AppBackLink
        to="/dashboard/settings/ai"
        class="mb-3"
      >
        Back to AI configuration
      </AppBackLink>
      <div class="flex items-center gap-2.5">
        <div class="ui-icon-state ui-icon-state-brand flex size-9 items-center justify-center rounded-lg">
          <AiProviderLogo :provider="form.provider" class="size-5" />
        </div>
        <div>
          <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">
            {{ isEdit ? `Edit ${config?.name || 'configuration'}` : 'Add an AI model' }}
          </h1>
          <p class="text-xs text-surface-500 dark:text-surface-400">
            {{ isEdit
              ? 'Update settings, rotate the API key, or change pricing for this model.'
              : 'Connect an AI provider so the chatbot and candidate analysis can use it.' }}
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-5">
      <!-- 1. Provider -->
      <section class="ui-panel p-5 sm:p-6">
        <header class="mb-3">
          <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Provider</h2>
        </header>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <button
            v-for="(info, key) in availableProviders ?? {}"
            :key="key"
            type="button"
            class="ui-selectable-panel flex h-20 flex-col items-center justify-center gap-2 px-2 text-center"
            :class="form.provider === key
              ? 'ui-selectable-panel-active text-brand-600 dark:text-brand-300'
              : 'text-surface-600 dark:text-surface-300'"
            @click="pickProvider(String(key))"
          >
            <span
              class="flex size-7 items-center justify-center transition-colors"
            >
              <AiProviderLogo :provider="String(key)" class="max-h-5 max-w-6" />
            </span>
            <span class="text-xs font-semibold text-surface-900 dark:text-surface-100">{{ providerShortName(String(key), info.name) }}</span>
          </button>
        </div>
      </section>

      <!-- 2. Model -->
      <section v-if="selectedProvider" class="ui-panel p-5 sm:p-6">
        <header class="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Model</h2>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <button
              v-if="!isEdit"
              type="button"
              :disabled="isRefreshingModels"
              class="ui-button ui-button-secondary h-8 px-3 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              @click="refreshModelCatalog"
            >
              <Loader2 v-if="isRefreshingModels" class="size-3.5 animate-spin" />
              <RefreshCw v-else class="size-3.5" />
              Refresh models
            </button>
            <a
              v-if="selectedProvider.modelsUrl"
              :href="selectedProvider.modelsUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline shrink-0"
            >
              Browse all <ExternalLink class="size-3" />
            </a>
          </div>
        </header>

        <div v-if="selectedProvider.models.length" class="space-y-2">
          <label class="block text-xs font-medium text-surface-700 dark:text-surface-300">
            Recommended model
          </label>
          <FactorySelect
            :model-value="form.model"
            :options="[
              ...(form.model && !selectedModel ? [{ value: form.model, label: `${form.model} - Custom` }] : []),
              ...selectedProvider.models.map(m => ({ value: m.id, label: modelOptionLabel(m) })),
            ]"
            @update:model-value="onModelSelect"
          />
          <p
            v-if="selectedModel"
            class="text-[11px] text-surface-500 dark:text-surface-400"
          >
            <span class="font-mono">{{ selectedModel.id }}</span>
            <span v-if="modelPriceLabel(selectedModel)"> · {{ modelPriceLabel(selectedModel) }}</span>
          </p>
        </div>

        <details class="mt-4">
          <summary class="text-xs text-surface-500 dark:text-surface-400 cursor-pointer hover:text-surface-700 dark:hover:text-surface-200 select-none inline-flex items-center gap-1">
            <ChevronDown class="size-3 transition-transform group-open:rotate-180" />
            {{ selectedProvider.models.length ? 'Use a different model identifier' : 'Set the model identifier' }}
          </summary>
          <div class="mt-3">
            <input
              v-model="form.model"
              type="text"
              placeholder="e.g. gpt-4.1-mini, llama-3.1-70b, mistral-large-latest"
              class="ui-field font-mono"
            >
            <p class="mt-1 text-[11px] text-surface-500">
              The exact string the provider expects in API calls.
            </p>
          </div>
        </details>
      </section>

      <!-- 3. Connection -->
      <section class="ui-panel p-5 sm:p-6">
        <header class="mb-4">
          <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Connection</h2>
          <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
            Give this configuration a name and connect your API key. Keys are encrypted with AES-256-GCM and never sent back to the browser.
          </p>
        </header>

        <div class="space-y-5">
          <!-- Friendly name -->
          <div>
            <label class="block text-xs font-medium text-surface-700 dark:text-surface-300 mb-1.5">
              Display name
            </label>
            <input
              v-model="form.name"
              type="text"
              placeholder="e.g. GPT-4o (production)"
              class="ui-field"
            >
            <p class="mt-1 text-[11px] text-surface-500">
              Shown in the model picker. Use something memorable.
            </p>
          </div>

          <!-- Base URL (custom only) -->
          <div v-if="isCustomProvider">
            <label class="block text-xs font-medium text-surface-700 dark:text-surface-300 mb-1.5">
              Base URL
            </label>
            <input
              v-model="form.baseUrl"
              type="url"
              placeholder="https://api.example.com/v1"
              class="ui-field font-mono"
            >
            <p class="mt-1 text-[11px] text-surface-500">
              Any OpenAI-compatible endpoint (Ollama, vLLM, OpenRouter, etc).
            </p>
          </div>

          <!-- API key -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-medium text-surface-700 dark:text-surface-300">
                API key
                <span v-if="isEdit" class="ml-1 text-surface-400 font-normal">(leave blank to keep current)</span>
              </label>
              <a
                v-if="selectedProvider?.apiKeyUrl"
                :href="selectedProvider.apiKeyUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
              >
                Get a key <ExternalLink class="size-3" />
              </a>
            </div>
            <div class="relative">
              <input
                v-model="form.apiKey"
                :type="showApiKey ? 'text' : 'password'"
                :placeholder="isEdit ? '••••••••••••' : 'sk-…'"
                autocomplete="off"
                class="ui-field pr-10 font-mono"
              >
              <button
                type="button"
                class="absolute inset-y-0 right-0 flex items-center px-3 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 cursor-pointer"
                :title="showApiKey ? 'Hide key' : 'Show key'"
                @click="showApiKey = !showApiKey"
              >
                <Eye v-if="showApiKey" class="size-4" />
                <EyeOff v-else class="size-4" />
              </button>
            </div>
          </div>

          <!-- Test connection -->
          <div v-if="isEdit" class="flex items-center gap-3 pt-1">
            <button
              type="button"
              :disabled="isTesting"
              class="ui-button ui-button-secondary px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              @click="handleTest"
            >
              <Loader2 v-if="isTesting" class="size-3.5 animate-spin" />
              <Zap v-else class="size-3.5" />
              {{ isTesting ? 'Testing…' : 'Test connection' }}
            </button>
            <span
              v-if="testResult?.success"
              class="inline-flex items-center gap-1 text-xs text-success-600 dark:text-success-400"
            >
              <Check class="size-3.5" /> Connection verified.
            </span>
            <span
              v-else-if="testResult && !testResult.success"
              class="inline-flex items-start gap-1 text-xs text-danger-600 dark:text-danger-400"
            >
              <AlertTriangle class="size-3.5 mt-px" /> {{ testResult.message }}
            </span>
          </div>
        </div>
      </section>

      <!-- Defaults (only when adding and not first) -->
      <section v-if="!isEdit && !isFirst" class="ui-panel p-5 sm:p-6">
        <header class="mb-4">
          <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Use as default</h2>
          <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
            Optional. You can change defaults later from the list view.
          </p>
        </header>
        <div class="space-y-2">
          <label class="ui-selectable-panel flex items-start gap-3 px-4 py-3">
            <input
              v-model="form.isDefaultChatbot"
              type="checkbox"
              class="mt-0.5 size-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            >
            <div class="flex-1">
              <div class="flex items-center gap-1.5 text-sm font-medium text-surface-900 dark:text-surface-100">
                <Sparkles class="size-3.5 text-brand-500" />
                Chatbot conversations
              </div>
              <p class="text-[11px] text-surface-500 dark:text-surface-400 mt-0.5">
                Use this model when chatting with candidates and recruiters.
              </p>
            </div>
          </label>
          <label class="ui-selectable-panel flex items-start gap-3 px-4 py-3">
            <input
              v-model="form.isDefaultAnalysis"
              type="checkbox"
              class="mt-0.5 size-4 rounded border-surface-300 text-warning-600 focus:ring-warning-500"
            >
            <div class="flex-1">
              <div class="flex items-center gap-1.5 text-sm font-medium text-surface-900 dark:text-surface-100">
                <Star class="size-3.5 text-warning-500" />
                Candidate analysis
              </div>
              <p class="text-[11px] text-surface-500 dark:text-surface-400 mt-0.5">
                Use this model to score and analyse applications.
              </p>
            </div>
          </label>
        </div>
      </section>

      <p
        v-if="!isEdit && isFirst"
        class="ui-alert ui-alert-info px-4 py-3 text-xs flex items-start gap-2"
      >
        <Sparkles class="size-3.5 mt-0.5 shrink-0" />
        This is your first model — it will automatically become the default for both the chatbot and candidate analysis.
      </p>

      <!-- Advanced -->
      <section class="ui-panel overflow-hidden">
        <button
          type="button"
          class="w-full px-5 sm:px-6 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
          @click="showAdvanced = !showAdvanced"
        >
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Advanced</h2>
            <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              Output token limit and pricing. Defaults work for most setups.
            </p>
          </div>
          <ChevronDown
            class="size-4 text-surface-400 transition-transform"
            :class="showAdvanced ? 'rotate-180' : ''"
          />
        </button>
        <div v-if="showAdvanced" class="ui-panel-header border-b-0 px-5 sm:px-6 py-5 space-y-5">
          <!-- Max output tokens -->
          <div>
            <label class="block text-xs font-medium text-surface-700 dark:text-surface-300 mb-1.5">
              Max output tokens
            </label>
            <input
              v-model.number="form.maxTokens"
              type="number"
              min="256"
              max="200000"
              step="256"
              class="ui-field font-mono"
            >
            <p class="mt-1 text-[11px] text-surface-500">
              Maximum tokens the model can generate per response. Range: 256 – 200,000. Defaults to {{ DEFAULT_MAX_TOKENS.toLocaleString() }}.
            </p>
          </div>

          <!-- Pricing -->
          <div>
            <h3 class="text-xs font-medium text-surface-700 dark:text-surface-300 mb-2">
              Pricing per 1M tokens
              <span class="ml-1 text-surface-400 font-normal">(USD — auto-filled, adjust to match your billing)</span>
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] font-medium text-surface-500 dark:text-surface-400 mb-1">Input</label>
                <input
                  v-model.number="form.inputPricePer1m"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  class="ui-field font-mono"
                >
              </div>
              <div>
                <label class="block text-[11px] font-medium text-surface-500 dark:text-surface-400 mb-1">Output</label>
                <input
                  v-model.number="form.outputPricePer1m"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  class="ui-field font-mono"
                >
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>

    <!-- Sticky save bar -->
    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-surface-200 dark:border-surface-800 bg-white/90 dark:bg-surface-950/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-surface-950/70 lg:left-56">
      <div class="mx-auto max-w-4xl px-4 sm:px-6 py-3 flex items-center justify-end gap-2">
        <button
          type="button"
          class="ui-button ui-button-secondary"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="!canSave || isSaving"
          class="ui-button ui-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
          @click="handleSave"
        >
          <Loader2 v-if="isSaving" class="size-4 animate-spin" />
          <Save v-else class="size-4" />
          {{ isSaving ? 'Saving…' : (isEdit ? 'Save changes' : 'Add model') }}
        </button>
      </div>
    </div>
  </div>
</template>
