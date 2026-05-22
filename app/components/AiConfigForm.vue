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
  Brain, Sparkles, Eye, EyeOff, ExternalLink, Loader2, Check,
  Save, Zap, Star, AlertTriangle, ChevronDown, KeyRound, ArrowLeft,
} from 'lucide-vue-next'

interface ModelInfo {
  id: string
  label: string
  description: string
  inputPricePer1m?: number
  outputPricePer1m?: number
  badge?: 'recommended' | 'fast' | 'powerful' | 'cheap'
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
if (!isEdit.value && props.providers) {
  const provKey = props.providers.openai ? 'openai' : Object.keys(props.providers)[0] ?? 'openai'
  const provInfo = props.providers[provKey]
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
const testResult = ref<{ success: boolean, message?: string } | null>(null)

const selectedProvider = computed<ProviderInfo | null>(() =>
  props.providers?.[form.value.provider] ?? null,
)

const isCustomProvider = computed(() => form.value.provider === 'openai_compatible')

function pickModel(m: ModelInfo) {
  form.value.model = m.id
  form.value.inputPricePer1m = m.inputPricePer1m ?? form.value.inputPricePer1m
  form.value.outputPricePer1m = m.outputPricePer1m ?? form.value.outputPricePer1m
  // Auto-set the friendly name only if the user hasn't customised it.
  if (!form.value.name || /^(GPT|Claude|Gemini|Llama|Mistral|New configuration)/i.test(form.value.name)) {
    form.value.name = m.label
  }
}

function pickProvider(key: string) {
  form.value.provider = key
  const first = props.providers?.[key]?.models[0]
  if (first) {
    pickModel(first)
  }
  else {
    form.value.model = ''
    form.value.inputPricePer1m = null
    form.value.outputPricePer1m = null
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

const badgeClass = (badge?: ModelInfo['badge']) => {
  switch (badge) {
    case 'recommended': return 'ui-pill-brand'
    case 'fast': return 'ui-pill-success'
    case 'powerful': return 'ui-pill-info'
    case 'cheap': return 'ui-pill-success'
    default: return 'hidden'
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
</script>

<template>
  <div class="ui-settings-page ui-settings-page-form">
    <!-- Header -->
    <div class="ui-settings-page-header">
      <NuxtLink
        to="/dashboard/settings/ai"
        class="ui-inline-link inline-flex items-center gap-1 text-xs font-medium mb-3"
      >
        <ArrowLeft class="size-3.5" />
        Back to AI configuration
      </NuxtLink>
      <div class="flex items-center gap-2.5">
        <div class="ui-icon-state ui-dashboard-soft-icon ui-icon-state-brand ui-icon-tile size-9">
          <Brain class="size-5" />
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
      <section class="ui-panel ui-dashboard-panel ui-settings-panel ui-settings-panel-content">
        <header class="mb-4">
          <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Provider</h2>
          <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
            Choose where the model runs. We'll suggest the best models for that provider next.
          </p>
        </header>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            v-for="(info, key) in providers ?? {}"
            :key="key"
            type="button"
            class="ui-selectable-panel flex flex-col items-start gap-1 px-3 py-2.5 text-left"
            :class="form.provider === key
              ? 'ui-selectable-panel-active'
              : ''"
            @click="pickProvider(String(key))"
          >
            <span class="text-sm font-semibold text-surface-900 dark:text-surface-100">{{ info.name }}</span>
            <span class="text-[11px] text-surface-500 dark:text-surface-400 line-clamp-2">{{ info.tagline }}</span>
          </button>
        </div>
      </section>

      <!-- 2. Model -->
      <section v-if="selectedProvider" class="ui-panel ui-dashboard-panel ui-settings-panel ui-settings-panel-content">
        <header class="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Model</h2>
            <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              Pick a recommended model — or paste any model identifier the provider supports.
            </p>
          </div>
          <a
            v-if="selectedProvider.modelsUrl"
            :href="selectedProvider.modelsUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="ui-inline-link ui-inline-link-brand inline-flex items-center gap-1 text-xs shrink-0"
          >
            Browse all <ExternalLink class="size-3" />
          </a>
        </header>

        <div v-if="selectedProvider.models.length" class="grid sm:grid-cols-2 gap-2">
          <button
            v-for="m in selectedProvider.models"
            :key="m.id"
            type="button"
            class="ui-selectable-panel px-3 py-3 text-left"
            :class="form.model === m.id
              ? 'ui-selectable-panel-active'
              : ''"
            @click="pickModel(m)"
          >
            <div class="flex items-start justify-between gap-2 mb-1">
              <span class="text-sm font-medium text-surface-900 dark:text-surface-100">{{ m.label }}</span>
              <span
                v-if="m.badge"
                class="ui-pill rounded-full px-1.5 py-0.5 text-[10px] shrink-0"
                :class="badgeClass(m.badge)"
              >
                <Star v-if="m.badge === 'recommended'" class="size-2.5" />
                <Zap v-else-if="m.badge === 'fast'" class="size-2.5" />
                {{ badgeLabel(m.badge) }}
              </span>
            </div>
            <p class="text-[11px] text-surface-500 dark:text-surface-400 line-clamp-2">{{ m.description }}</p>
            <div v-if="m.inputPricePer1m != null || m.outputPricePer1m != null" class="mt-2 text-[10px] text-surface-400">
              ${{ m.inputPricePer1m?.toFixed(2) ?? '—' }} in · ${{ m.outputPricePer1m?.toFixed(2) ?? '—' }} out / 1M tokens
            </div>
          </button>
        </div>

        <details class="mt-4">
          <summary class="ui-disclosure-trigger text-xs cursor-pointer select-none inline-flex items-center gap-1">
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
      <section class="ui-panel ui-dashboard-panel ui-settings-panel ui-settings-panel-content">
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
                class="ui-inline-link ui-inline-link-brand inline-flex items-center gap-1 text-[11px]"
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
                class="ui-field-icon-button absolute inset-y-0 right-0 flex items-center px-3 cursor-pointer"
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
              class="ui-feedback-success text-xs"
            >
              <Check class="size-3.5" /> Connection verified.
            </span>
            <span
              v-else-if="testResult && !testResult.success"
              class="ui-feedback-danger items-start text-xs"
            >
              <AlertTriangle class="size-3.5 mt-px" /> {{ testResult.message }}
            </span>
          </div>
        </div>
      </section>

      <!-- Defaults (only when adding and not first) -->
      <section v-if="!isEdit && !isFirst" class="ui-panel ui-dashboard-panel ui-settings-panel ui-settings-panel-content">
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
              class="ui-checkbox ui-checkbox-brand mt-0.5 size-4"
            >
            <div class="flex-1">
              <div class="flex items-center gap-1.5 text-sm font-medium text-surface-900 dark:text-surface-100">
                <Sparkles class="ui-icon-brand size-3.5" />
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
              class="ui-checkbox ui-checkbox-warning mt-0.5 size-4"
            >
            <div class="flex-1">
              <div class="flex items-center gap-1.5 text-sm font-medium text-surface-900 dark:text-surface-100">
                <Star class="ui-icon-warning size-3.5" />
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
      <section class="ui-panel ui-dashboard-panel ui-settings-panel">
        <button
          type="button"
          class="ui-disclosure-trigger w-full px-5 sm:px-6 py-4 flex items-center justify-between text-left cursor-pointer"
          @click="showAdvanced = !showAdvanced"
        >
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Advanced</h2>
            <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              Output token limit and pricing. Defaults work for most setups.
            </p>
          </div>
          <ChevronDown
            class="size-4 transition-transform"
            :class="showAdvanced ? 'rotate-180' : ''"
          />
        </button>
        <div v-if="showAdvanced" class="ui-panel-header ui-dashboard-panel-header ui-settings-panel-body border-b-0 space-y-5">
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

      <p class="text-[11px] text-surface-500 dark:text-surface-400 flex items-start gap-1.5">
        <KeyRound class="size-3 mt-0.5 shrink-0" />
        <span>API keys are encrypted at rest with AES-256-GCM and never returned to the browser.</span>
      </p>
    </div>

    <!-- Sticky save bar -->
    <div class="ui-action-bar fixed inset-x-0 bottom-0 z-20">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-3 flex items-center justify-end gap-2">
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
