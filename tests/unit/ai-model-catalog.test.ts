import { describe, expect, it, vi } from 'vitest'
import {
  getCuratedProviderRegistry,
  mergeCuratedWithDiscovered,
  refreshProviderModels,
  type DiscoveredProviderModels,
  type ProviderCatalogInfo,
} from '../../server/utils/ai/modelCatalog'

describe('AI model catalog', () => {
  it('returns a defensive copy of the curated registry', () => {
    const first = getCuratedProviderRegistry()
    const second = getCuratedProviderRegistry()

    first.openai.models[0]!.label = 'Mutated'

    expect(second.openai.models[0]!.label).not.toBe('Mutated')
  })

  it('merges discovered models into curated models without losing curated display choices', () => {
    const curated: ProviderCatalogInfo = {
      name: 'OpenAI',
      tagline: 'Curated tagline',
      modelsUrl: 'https://example.com/models',
      apiKeyUrl: 'https://example.com/keys',
      supportsBaseUrl: false,
      defaultModel: 'gpt-5.4-mini',
      models: [
        {
          id: 'gpt-5.4-mini',
          label: 'GPT-5.4 Mini',
          description: 'Curated copy stays canonical.',
          inputPricePer1m: 0.4,
          outputPricePer1m: 1.6,
          badge: 'recommended',
        },
        {
          id: 'gpt-4o-mini',
          label: 'GPT-4o Mini',
          description: 'Legacy fallback.',
        },
      ],
    }

    const discovered: DiscoveredProviderModels = {
      provider: 'openai',
      refreshedAt: '2026-05-21T12:00:00.000Z',
      models: [
        {
          id: 'gpt-5.4-mini',
          label: 'Provider label should not win',
          maxInputTokens: 400000,
          maxOutputTokens: 128000,
          source: 'provider',
        },
        {
          id: 'gpt-5.5',
          label: 'GPT-5.5',
          source: 'provider',
        },
        {
          id: 'text-embedding-3-large',
          label: 'Embedding model',
          source: 'provider',
        },
      ],
    }

    const merged = mergeCuratedWithDiscovered(curated, discovered)

    expect(merged.catalogRefreshedAt).toBe(discovered.refreshedAt)
    expect(merged.models.map((model) => model.id)).toEqual([
      'gpt-5.4-mini',
      'gpt-4o-mini',
      'gpt-5.5',
    ])

    expect(merged.models[0]).toMatchObject({
      id: 'gpt-5.4-mini',
      label: 'GPT-5.4 Mini',
      description: 'Curated copy stays canonical.',
      availability: 'available',
      maxInputTokens: 400000,
      maxOutputTokens: 128000,
      badge: 'recommended',
    })
    expect(merged.models[1]).toMatchObject({
      id: 'gpt-4o-mini',
      availability: 'not_returned',
      stale: true,
      replacementId: 'gpt-5.4-mini',
    })
    expect(merged.models[2]).toMatchObject({
      id: 'gpt-5.5',
      availability: 'discovered',
    })
  })

  it('normalizes and filters OpenAI model-list responses', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-5.4-mini', created: 1770000000, owned_by: 'openai' },
          { id: 'dall-e-3', created: 1700000000, owned_by: 'openai' },
          { id: 'text-embedding-3-small', created: 1700000000, owned_by: 'openai' },
        ],
      }),
    })) as unknown as typeof fetch

    const result = await refreshProviderModels('openai', {
      apiKey: 'sk-test',
      force: true,
      fetchImpl,
      now: () => new Date('2026-05-21T12:00:00.000Z'),
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
    }))
    expect(result.models.map((model) => model.id)).toEqual(['gpt-5.4-mini'])
    expect(result.models[0]).toMatchObject({
      id: 'gpt-5.4-mini',
      createdAt: '2026-02-02T02:40:00.000Z',
      source: 'provider',
    })
  })

  it('normalizes and filters Gemini model-list responses to generation models', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        models: [
          {
            name: 'models/gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            description: 'Fast Gemini model.',
            inputTokenLimit: 1048576,
            outputTokenLimit: 65536,
            supportedGenerationMethods: ['generateContent', 'countTokens'],
          },
          {
            name: 'models/embedding-001',
            displayName: 'Embedding',
            supportedGenerationMethods: ['embedContent'],
          },
        ],
      }),
    })) as unknown as typeof fetch

    const result = await refreshProviderModels('google', {
      apiKey: 'google-key',
      force: true,
      fetchImpl,
      now: () => new Date('2026-05-21T12:00:00.000Z'),
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/models?key=google-key', expect.any(Object))
    expect(result.models.map((model) => model.id)).toEqual(['gemini-2.5-flash'])
    expect(result.models[0]).toMatchObject({
      label: 'Gemini 2.5 Flash',
      maxInputTokens: 1048576,
      maxOutputTokens: 65536,
      supports: { chat: true },
    })
  })
})
