/**
 * AI Provider Abstraction Layer
 *
 * Supports OpenAI, Anthropic, and custom OpenAI-compatible endpoints.
 * Credentials are decrypted per-request from the organization's AI config.
 * Never logs or stores raw API keys — only encrypted values in the database.
 */
import { appendFile } from 'node:fs/promises'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'
import { generateObject } from 'ai'
import type { z } from 'zod'
import { decrypt } from '../encryption'
import { assertSafeServerSideUrl, validateServerSideUrlShape } from '../serverSideUrl'

export type SupportedProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'openai_compatible'

export interface ProviderConfig {
  provider: SupportedProvider
  model: string
  apiKeyEncrypted: string
  baseUrl?: string | null
  maxTokens: number
}

/** Detailed info about a single model (presentation + suggested defaults). */
export interface ModelInfo {
  /** Provider-recognised model id, e.g. `gpt-4.1-mini`. */
  id: string
  /** Human label shown in dropdowns, e.g. `GPT‑4.1 Mini`. */
  label: string
  /** One-line plain-English description for non-experts. */
  description: string
  /** Suggested USD price per 1M input tokens — used to pre-fill the form. */
  inputPricePer1m?: number
  /** Suggested USD price per 1M output tokens — used to pre-fill the form. */
  outputPricePer1m?: number
  /** Optional badge: `recommended`, `fast`, `powerful`, `cheap`. */
  badge?: 'recommended' | 'fast' | 'powerful' | 'cheap'
  /** Whether this model came from the curated list, the provider API, or both. */
  availability?: 'curated' | 'available' | 'not_returned' | 'discovered'
  /** True when a curated model was not returned by the provider's model-list API. */
  stale?: boolean
  /** Provider-returned model that may be a better current replacement. */
  replacementId?: string
  /** Provider-reported maximum input context, when available. */
  maxInputTokens?: number
  /** Provider-reported maximum output tokens, when available. */
  maxOutputTokens?: number
  /** Provider-reported capabilities, normalized for the UI. */
  supports?: {
    chat?: boolean
    vision?: boolean
    tools?: boolean
    thinking?: boolean
  }
  /** Provider-reported creation time, when available. */
  createdAt?: string
  /** Catalog source for debugging/UI labels. */
  source?: 'curated' | 'provider'
}

/** Well-known providers with links for obtaining API keys and curated model lists. */
export const PROVIDER_REGISTRY: Record<string, {
  name: string
  /** Short tagline describing the provider for the UI. */
  tagline: string
  modelsUrl: string
  apiKeyUrl: string
  /** Optional docs link explaining how to get started. */
  signupUrl?: string
  /** Whether a custom Base URL field should be exposed. */
  supportsBaseUrl: boolean
  defaultModel: string
  models: ModelInfo[]
}> = {
  openai: {
    name: 'OpenAI',
    tagline: 'Industry-leading GPT models. The safest default for most teams.',
    modelsUrl: 'https://platform.openai.com/docs/models',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    signupUrl: 'https://platform.openai.com/signup',
    supportsBaseUrl: false,
    defaultModel: 'gpt-5.4-mini',
    models: [
      { id: 'gpt-5.5', label: 'GPT-5.5', description: 'Frontier OpenAI model for the hardest analysis and reasoning.', inputPricePer1m: 2.0, outputPricePer1m: 8.0, badge: 'powerful' },
      { id: 'gpt-5.4', label: 'GPT-5.4', description: 'High-quality default for nuanced recruiting workflows.', inputPricePer1m: 1.0, outputPricePer1m: 4.0, badge: 'recommended' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', description: 'Fast, balanced model for chat and high-volume candidate scoring.', inputPricePer1m: 0.25, outputPricePer1m: 1.0, badge: 'fast' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', description: 'Previous-generation fallback for existing OpenAI setups.', inputPricePer1m: 0.4, outputPricePer1m: 1.6 },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    tagline: 'Claude models — strong at long-form analysis and nuanced writing.',
    modelsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    signupUrl: 'https://console.anthropic.com/',
    supportsBaseUrl: false,
    defaultModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', description: 'Anthropic\'s strongest model for complex candidate analysis.', inputPricePer1m: 15.0, outputPricePer1m: 75.0, badge: 'powerful' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'Balanced Claude model for scoring, summaries, and chat.', inputPricePer1m: 3.0, outputPricePer1m: 15.0, badge: 'recommended' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'Fast Claude model for quick reviews and high-volume workflows.', inputPricePer1m: 0.8, outputPricePer1m: 4.0, badge: 'fast' },
    ],
  },
  google: {
    name: 'Google AI (Gemini)',
    tagline: 'Gemini models — generous free tier and very fast inference.',
    modelsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    signupUrl: 'https://aistudio.google.com/',
    supportsBaseUrl: false,
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Google\'s top model — strong at reasoning and long contexts.', inputPricePer1m: 1.25, outputPricePer1m: 10.0, badge: 'powerful' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Excellent quality at a very low price. Recommended default.', inputPricePer1m: 0.3, outputPricePer1m: 2.5, badge: 'recommended' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Previous-gen fast model. Still solid and very cheap.', inputPricePer1m: 0.1, outputPricePer1m: 0.4, badge: 'cheap' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', description: 'Cheapest Gemini option for high-volume light tasks.', inputPricePer1m: 0.075, outputPricePer1m: 0.3, badge: 'cheap' },
    ],
  },
  xai: {
    name: 'xAI (Grok)',
    tagline: 'Grok models — strong reasoning, coding, and long-context analysis.',
    modelsUrl: 'https://docs.x.ai/developers/models',
    apiKeyUrl: 'https://console.x.ai/',
    signupUrl: 'https://console.x.ai/',
    supportsBaseUrl: false,
    defaultModel: 'grok-4.3',
    models: [
      { id: 'grok-4.3', label: 'Grok 4.3', description: 'Recommended Grok model for chatbot and candidate analysis.', inputPricePer1m: 1.25, outputPricePer1m: 2.5, badge: 'recommended' },
      { id: 'grok-4.3-latest', label: 'Grok 4.3 Latest', description: 'Alias that tracks the current Grok 4.3 release.', inputPricePer1m: 1.25, outputPricePer1m: 2.5 },
      { id: 'grok-build-0.1', label: 'Grok Build 0.1', description: 'Coding-focused Grok model for technical workflows.', inputPricePer1m: 1.0, outputPricePer1m: 2.0, badge: 'fast' },
    ],
  },
  openai_compatible: {
    name: 'OpenAI-Compatible (Custom)',
    tagline: 'Connect any OpenAI-compatible endpoint: Ollama, LM Studio, OpenRouter, Groq, Together AI, vLLM, …',
    modelsUrl: '',
    apiKeyUrl: '',
    supportsBaseUrl: true,
    defaultModel: '',
    models: [],
  },
}

/**
 * Create a language model instance from encrypted config.
 * Decrypts the API key just-in-time and never persists it in memory beyond the call.
 */
export function createLanguageModel(config: ProviderConfig) {
  const secret = env.BETTER_AUTH_SECRET
  const apiKey = decrypt(config.apiKeyEncrypted, secret)

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to decrypt AI API key. The key may be corrupted.',
    })
  }

  if (config.baseUrl) {
    const result = validateServerSideUrlShape(config.baseUrl)
    if (!result.ok) {
      throw createError({
        statusCode: 422,
        statusMessage: result.reason ?? 'AI provider base URL is not allowed.',
      })
    }
  }

  switch (config.provider) {
    case 'openai':
    case 'openai_compatible': {
      const openai = createOpenAI({
        apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })
      return openai(config.model)
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })
      return anthropic(config.model)
    }
    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })
      return google(config.model)
    }
    case 'xai': {
      const xai = createXai({
        apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })
      return xai(config.model)
    }
    default:
      throw createError({
        statusCode: 400,
        statusMessage: `Unsupported AI provider: ${config.provider}`,
      })
  }
}

/**
 * Generate a structured JSON response from the AI provider.
 * Uses Vercel AI SDK's `generateObject` for reliable schema-conformant output.
 */
export async function generateStructuredOutput<T>(
  config: ProviderConfig,
  options: {
    system: string
    prompt: string
    schema: z.ZodType<T>
    schemaName: string
    schemaDescription?: string
  },
): Promise<{ object: T; usage: { promptTokens: number; completionTokens: number } }> {
  if (env.FACTORY_AI_TEST_MODE === 'mock') {
    if (env.FACTORY_AI_CAPTURE_PATH) {
      await appendFile(
        env.FACTORY_AI_CAPTURE_PATH,
        `${JSON.stringify({
          provider: config.provider,
          model: config.model,
          schemaName: options.schemaName,
          system: options.system,
          prompt: options.prompt,
        })}\n`,
        'utf8',
      )
    }

    if (options.schemaName === 'CandidateScoring') {
      const object = options.schema.parse({
        evaluations: [{
          criterionKey: 'domain_relevance',
          maxScore: 10,
          applicantScore: 9,
          confidence: 96,
          evidence: 'The resume cites work with athletes, entertainers, founders, media, and investments.',
          strengths: ['Direct Factory-domain client experience is present.'],
          gaps: ['No material gaps were identified in the provided E2E fixture.'],
        }],
        summary: 'Deterministic E2E review: strong Factory-domain alignment for this candidate.',
      })

      return {
        object,
        usage: { promptTokens: 101, completionTokens: 29 },
      }
    }

    throw createError({
      statusCode: 422,
      statusMessage: `No deterministic AI mock response configured for schema: ${options.schemaName}`,
    })
  }

  if (config.baseUrl) {
    await assertSafeServerSideUrl(config.baseUrl)
  }

  const model = createLanguageModel(config)

  const result = await generateObject({
    model,
    system: options.system,
    prompt: options.prompt,
    schema: options.schema,
    schemaName: options.schemaName,
    schemaDescription: options.schemaDescription,
    maxTokens: config.maxTokens,
    temperature: 0.1,
  })

  return {
    object: result.object,
    usage: {
      promptTokens: result.usage.inputTokens ?? 0,
      completionTokens: result.usage.outputTokens ?? 0,
    },
  }
}
