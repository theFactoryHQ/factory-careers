import { beforeEach, describe, expect, it, vi } from 'vitest'

const providerMocks = vi.hoisted(() => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ model }))),
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ model }))),
  createGoogleGenerativeAI: vi.fn(() => vi.fn((model: string) => ({ model }))),
  createXai: vi.fn(() => vi.fn((model: string) => ({ model }))),
  safeOutboundFetch: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: providerMocks.createOpenAI }))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: providerMocks.createAnthropic }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: providerMocks.createGoogleGenerativeAI }))
vi.mock('@ai-sdk/xai', () => ({ createXai: providerMocks.createXai }))
vi.mock('../../server/utils/encryption', () => ({ decrypt: () => 'decrypted-key' }))
vi.mock('../../server/utils/safeOutboundFetch', () => ({
  safeOutboundFetch: providerMocks.safeOutboundFetch,
}))

import { createLanguageModel } from '../../server/utils/ai/provider'

beforeEach(() => {
  vi.stubGlobal('env', { BETTER_AUTH_SECRET: 'test-secret' })
  vi.stubGlobal('createError', (input: { statusMessage?: string }) => new Error(input.statusMessage))
  providerMocks.createOpenAI.mockClear()
})

describe('AI provider safe outbound fetch', () => {
  it('injects safe fetch for an organization-configured OpenAI-compatible base URL', () => {
    createLanguageModel({
      provider: 'openai_compatible',
      model: 'custom-model',
      apiKeyEncrypted: 'encrypted-key',
      baseUrl: 'https://llm.example.com/v1',
      maxTokens: 1024,
    })

    expect(providerMocks.createOpenAI).toHaveBeenCalledWith({
      apiKey: 'decrypted-key',
      baseURL: 'https://llm.example.com/v1',
      fetch: providerMocks.safeOutboundFetch,
    })
  })

  it('leaves static first-party OpenAI requests on the provider default fetch', () => {
    createLanguageModel({
      provider: 'openai',
      model: 'gpt-test',
      apiKeyEncrypted: 'encrypted-key',
      maxTokens: 1024,
    })

    expect(providerMocks.createOpenAI).toHaveBeenCalledWith({
      apiKey: 'decrypted-key',
    })
  })
})
