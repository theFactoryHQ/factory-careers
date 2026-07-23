import { PROVIDER_REGISTRY, type ModelInfo, type SupportedProvider } from './provider'
import { safeOutboundFetch } from '../safeOutboundFetch'

export interface ProviderCatalogInfo {
  name: string
  tagline: string
  modelsUrl: string
  apiKeyUrl: string
  signupUrl?: string
  supportsBaseUrl: boolean
  defaultModel: string
  models: ModelInfo[]
  catalogRefreshedAt?: string
  catalogCacheExpiresAt?: string
  catalogError?: string
}

export interface DiscoveredModelInfo {
  id: string
  label?: string
  description?: string
  createdAt?: string
  inputPricePer1m?: number
  outputPricePer1m?: number
  maxInputTokens?: number
  maxOutputTokens?: number
  aliases?: string[]
  supports?: ModelInfo['supports']
  source: 'provider'
}

export interface DiscoveredProviderModels {
  provider: SupportedProvider
  refreshedAt: string
  cacheExpiresAt?: string
  models: DiscoveredModelInfo[]
}

interface CachedProviderModels {
  expiresAt: number
  value: DiscoveredProviderModels
}

interface RefreshProviderModelsOptions {
  apiKey: string
  baseUrl?: string | null
  cacheKey?: string
  force?: boolean
  ttlMs?: number
  fetchImpl?: typeof fetch
  safeFetchImpl?: typeof fetch
  now?: () => Date
}

const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const modelCache = new Map<string, CachedProviderModels>()

export function getCuratedProviderRegistry(): Record<SupportedProvider, ProviderCatalogInfo> {
  const registry = cloneCatalog(PROVIDER_REGISTRY as Record<SupportedProvider, ProviderCatalogInfo>)
  for (const provider of Object.values(registry)) {
    provider.models = provider.models.map((model) => ({
      ...model,
      availability: model.availability ?? 'curated',
      source: model.source ?? 'curated',
    }))
  }
  return registry
}

export function getProviderRegistryWithCachedModels(): Record<SupportedProvider, ProviderCatalogInfo> {
  const registry = getCuratedProviderRegistry()
  const now = Date.now()
  for (const [cacheKey, cached] of modelCache.entries()) {
    if (cached.expiresAt <= now) {
      modelCache.delete(cacheKey)
      continue
    }
    const provider = cached.value.provider
    registry[provider] = mergeCuratedWithDiscovered(registry[provider], cached.value)
  }
  return registry
}

export function mergeCuratedWithDiscovered(
  curated: ProviderCatalogInfo,
  discovered?: DiscoveredProviderModels | null,
): ProviderCatalogInfo {
  const next: ProviderCatalogInfo = {
    ...cloneCatalog(curated),
    models: [],
  }

  if (!discovered) {
    next.models = curated.models.map((model) => ({ ...model, availability: model.availability ?? 'curated', source: 'curated' }))
    return next
  }

  const discoveredById = new Map(discovered.models.map((model) => [normalizeModelId(model.id), model]))
  const curatedIds = new Set<string>()

  next.catalogRefreshedAt = discovered.refreshedAt
  if (discovered.cacheExpiresAt) next.catalogCacheExpiresAt = discovered.cacheExpiresAt

  next.models = curated.models.map((model) => {
    curatedIds.add(normalizeModelId(model.id))
    const dynamic = discoveredById.get(normalizeModelId(model.id))
    if (!dynamic) {
      return {
        ...model,
        availability: 'not_returned',
        stale: true,
        replacementId: suggestReplacementId(model.id, discovered.models),
        source: 'curated',
      }
    }

    return {
      ...model,
      availability: 'available',
      stale: false,
      source: 'curated',
      createdAt: dynamic.createdAt ?? model.createdAt,
      maxInputTokens: dynamic.maxInputTokens ?? model.maxInputTokens,
      maxOutputTokens: dynamic.maxOutputTokens ?? model.maxOutputTokens,
      supports: dynamic.supports ?? model.supports,
    }
  })

  const discoveredOnly = discovered.models
    .filter((model) => !curatedIds.has(normalizeModelId(model.id)))
    .filter((model) => shouldShowModel(model.id, discovered.provider))
    .map<ModelInfo>((model) => ({
      id: model.id,
      label: model.label ?? humanizeModelId(model.id),
      description: model.description ?? 'Returned by the provider model catalog.',
      inputPricePer1m: model.inputPricePer1m,
      outputPricePer1m: model.outputPricePer1m,
      availability: 'discovered',
      stale: false,
      createdAt: model.createdAt,
      maxInputTokens: model.maxInputTokens,
      maxOutputTokens: model.maxOutputTokens,
      supports: model.supports,
      source: 'provider',
    }))

  next.models.push(...discoveredOnly)
  return next
}

export async function refreshProviderModels(
  provider: SupportedProvider,
  options: RefreshProviderModelsOptions,
): Promise<DiscoveredProviderModels> {
  const now = options.now?.() ?? new Date()
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS
  const cacheKey = options.cacheKey ?? buildCacheKey(provider, options.baseUrl)
  const cached = modelCache.get(cacheKey)

  if (!options.force && cached && cached.expiresAt > now.getTime()) {
    return cached.value
  }

  const fetchImpl = options.fetchImpl
    ?? (options.baseUrl ? options.safeFetchImpl ?? safeOutboundFetch : fetch)
  const models = await fetchProviderModels(provider, {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    fetchImpl,
  })

  const refreshedAt = now.toISOString()
  const cacheExpiresAt = new Date(now.getTime() + ttlMs).toISOString()
  const value: DiscoveredProviderModels = {
    provider,
    refreshedAt,
    cacheExpiresAt,
    models,
  }

  modelCache.set(cacheKey, {
    expiresAt: now.getTime() + ttlMs,
    value,
  })

  return value
}

export function clearModelCatalogCache() {
  modelCache.clear()
}

function buildCacheKey(provider: SupportedProvider, baseUrl?: string | null): string {
  return `${provider}:${baseUrl ?? ''}`
}

async function fetchProviderModels(
  provider: SupportedProvider,
  options: { apiKey: string, baseUrl?: string | null, fetchImpl: typeof fetch },
): Promise<DiscoveredModelInfo[]> {
  switch (provider) {
    case 'openai':
      return fetchOpenAiModels(options)
    case 'openai_compatible':
      return fetchOpenAiModels(options)
    case 'anthropic':
      return fetchAnthropicModels(options)
    case 'google':
      return fetchGoogleModels(options)
    case 'xai':
      return fetchXaiModels(options)
    default:
      return []
  }
}

async function fetchOpenAiModels(options: { apiKey: string, baseUrl?: string | null, fetchImpl: typeof fetch }) {
  const baseUrl = trimTrailingSlash(options.baseUrl || 'https://api.openai.com/v1')
  const response = await options.fetchImpl(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      Accept: 'application/json',
    },
  })
  const json = await parseProviderResponse(response, 'OpenAI')
  const data = Array.isArray(json.data) ? json.data : []

  return data
    .map((model: any): DiscoveredModelInfo => ({
      id: String(model.id ?? ''),
      label: model.id ? humanizeModelId(String(model.id)) : undefined,
      createdAt: epochSecondsToIso(model.created),
      source: 'provider',
    }))
    .filter((model: DiscoveredModelInfo) => shouldShowModel(model.id, options.baseUrl ? 'openai_compatible' : 'openai'))
}

async function fetchAnthropicModels(options: { apiKey: string, fetchImpl: typeof fetch }) {
  const response = await options.fetchImpl('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
      'Accept': 'application/json',
    },
  })
  const json = await parseProviderResponse(response, 'Anthropic')
  const data = Array.isArray(json.data) ? json.data : []

  return data
    .map((model: any): DiscoveredModelInfo => ({
      id: String(model.id ?? ''),
      label: model.display_name ?? model.name ?? humanizeModelId(String(model.id ?? '')),
      createdAt: typeof model.created_at === 'string' ? model.created_at : undefined,
      maxInputTokens: numberOrUndefined(model.max_input_tokens),
      maxOutputTokens: numberOrUndefined(model.max_tokens ?? model.max_output_tokens),
      supports: normalizeCapabilities(model.capabilities),
      source: 'provider',
    }))
    .filter((model: DiscoveredModelInfo) => shouldShowModel(model.id, 'anthropic'))
}

async function fetchGoogleModels(options: { apiKey: string, fetchImpl: typeof fetch }) {
  const response = await options.fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(options.apiKey)}`, {
    headers: { Accept: 'application/json' },
  })
  const json = await parseProviderResponse(response, 'Google AI')
  const data = Array.isArray(json.models) ? json.models : []

  return data
    .filter((model: any) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
    .map((model: any): DiscoveredModelInfo => {
      const id = String(model.name ?? '').replace(/^models\//, '')
      return {
        id,
        label: model.displayName ?? humanizeModelId(id),
        description: model.description,
        maxInputTokens: numberOrUndefined(model.inputTokenLimit),
        maxOutputTokens: numberOrUndefined(model.outputTokenLimit),
        supports: {
          chat: true,
          thinking: Boolean(model.thinking === true || model.supportedGenerationMethods?.includes('thinking')),
        },
        source: 'provider',
      }
    })
    .filter((model: DiscoveredModelInfo) => shouldShowModel(model.id, 'google'))
}

async function fetchXaiModels(options: { apiKey: string, fetchImpl: typeof fetch }) {
  const response = await options.fetchImpl('https://api.x.ai/v1/language-models', {
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      Accept: 'application/json',
    },
  })
  const json = await parseProviderResponse(response, 'xAI')
  const data = Array.isArray(json.models) ? json.models : Array.isArray(json.data) ? json.data : []

  return data
    .map((model: any): DiscoveredModelInfo => {
      const id = String(model.id ?? model.name ?? '')
      const promptPrice = normalizeXaiPricePer1m(model.pricing?.prompt_text_token_price ?? model.prompt_text_token_price)
      const completionPrice = normalizeXaiPricePer1m(model.pricing?.completion_text_token_price ?? model.completion_text_token_price)
      return {
        id,
        label: model.display_name ?? model.name ?? humanizeModelId(id),
        description: model.description,
        aliases: Array.isArray(model.aliases) ? model.aliases : undefined,
        inputPricePer1m: promptPrice,
        outputPricePer1m: completionPrice,
        maxInputTokens: numberOrUndefined(model.context_window ?? model.max_context_length ?? model.max_input_tokens),
        maxOutputTokens: numberOrUndefined(model.max_output_tokens),
        supports: {
          chat: true,
          vision: hasModality(model, 'image'),
          tools: Boolean(model.supports_tools ?? model.tool_calling),
          thinking: Boolean(model.reasoning ?? model.supports_reasoning),
        },
        source: 'provider',
      }
    })
    .filter((model: DiscoveredModelInfo) => shouldShowModel(model.id, 'xai'))
}

async function parseProviderResponse(response: Response, providerLabel: string): Promise<any> {
  if (!response.ok) {
    let message = `${providerLabel} model catalog returned ${response.status}`
    try {
      const body = await response.json()
      message = body?.error?.message ?? body?.message ?? message
    }
    catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message)
  }
  return response.json()
}

function normalizeCapabilities(capabilities: unknown): ModelInfo['supports'] | undefined {
  if (!capabilities || typeof capabilities !== 'object') return undefined
  const value = capabilities as Record<string, unknown>
  return {
    chat: true,
    vision: Boolean(value.vision || value.image),
    tools: Boolean(value.tools || value.tool_use),
    thinking: Boolean(value.thinking || value.reasoning),
  }
}

function shouldShowModel(modelId: string, provider: SupportedProvider): boolean {
  const id = normalizeModelId(modelId)
  if (!id) return false
  const excluded = [
    'embed',
    'embedding',
    'dall-e',
    'image',
    'img',
    'audio',
    'tts',
    'speech',
    'whisper',
    'transcribe',
    'moderation',
    'rerank',
    'realtime',
    'vision-preview',
  ]
  if (excluded.some((needle) => id.includes(needle))) return false

  if (provider === 'anthropic') return id.startsWith('claude')
  if (provider === 'google') return id.startsWith('gemini')
  if (provider === 'xai') return id.includes('grok')
  if (provider === 'openai') {
    return /^(gpt-|o\d|chatgpt-)/.test(id)
  }
  return true
}

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase()
}

function humanizeModelId(modelId: string): string {
  return modelId
    .replace(/^models\//, '')
    .split(/[-_.]/)
    .filter(Boolean)
    .map((part) => {
      if (/^gpt$/i.test(part)) return 'GPT'
      if (/^xai$/i.test(part)) return 'xAI'
      if (/^\d+$/.test(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

function suggestReplacementId(modelId: string, discoveredModels: DiscoveredModelInfo[]): string | undefined {
  const visible = discoveredModels.filter((model) => shouldShowModel(model.id, discoveredModelsProviderGuess(model.id)))
  if (visible.length === 0) return undefined

  const normalized = normalizeModelId(modelId)
  const family = normalized.split(/[-_.]/).slice(0, 2).join('-')
  const sameFamily = visible.find((model) => normalizeModelId(model.id).startsWith(family))
  return sameFamily?.id ?? visible[0]?.id
}

function discoveredModelsProviderGuess(modelId: string): SupportedProvider {
  const id = normalizeModelId(modelId)
  if (id.startsWith('claude')) return 'anthropic'
  if (id.startsWith('gemini')) return 'google'
  if (id.includes('grok')) return 'xai'
  if (/^(gpt-|o\d|chatgpt-)/.test(id)) return 'openai'
  return 'openai_compatible'
}

function hasModality(model: Record<string, unknown>, modality: string): boolean {
  const modalities = model.modalities ?? model.input_modalities ?? model.output_modalities
  return Array.isArray(modalities) && modalities.map(String).some((item) => item.toLowerCase().includes(modality))
}

function epochSecondsToIso(value: unknown): string | undefined {
  const num = numberOrUndefined(value)
  if (num == null) return undefined
  return new Date(num * 1000).toISOString()
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return undefined
}

function normalizeXaiPricePer1m(value: unknown): number | undefined {
  const num = numberOrUndefined(value)
  if (num == null) return undefined
  // xAI reports token prices as USD cents per 100M tokens.
  if (num > 100) return num / 10_000
  // Some SDK-style wrappers report dollars per token; keep this path defensive.
  if (num > 0 && num < 0.01) return num * 1_000_000
  return num
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function cloneCatalog<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
