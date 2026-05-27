import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/factory_careers_test',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://127.0.0.1:3333',
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_ACCESS_KEY: 'test-key',
  S3_SECRET_KEY: 'test-secret',
  S3_BUCKET: 'test-bucket',
  FACTORY_AI_TEST_MODE: 'mock',
}

async function loadProviderWithMockEnv(capturePath: string) {
  vi.resetModules()
  ;(globalThis as Record<string, unknown>).__env = undefined

  for (const [key, value] of Object.entries(baseEnv)) {
    vi.stubEnv(key, value)
  }
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('FACTORY_AI_CAPTURE_PATH', capturePath)
  vi.stubGlobal('env', {
    FACTORY_AI_TEST_MODE: 'mock',
    FACTORY_AI_CAPTURE_PATH: capturePath,
  })
  vi.stubGlobal('createError', (input: { statusMessage?: string }) => new Error(input.statusMessage ?? 'createError'))

  return import('../../server/utils/ai/provider')
}

describe('deterministic AI provider mock', () => {
  let capturePath: string

  beforeEach(() => {
    capturePath = join(tmpdir(), `factory-careers-ai-provider-mock-${Date.now()}-${Math.random()}.jsonl`)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    ;(globalThis as Record<string, unknown>).__env = undefined
    await rm(capturePath, { force: true })
  })

  it('returns a local success object for connection checks', async () => {
    const { generateStructuredOutput } = await loadProviderWithMockEnv(capturePath)

    await expect(generateStructuredOutput(
      {
        provider: 'openai',
        model: 'factory-e2e-test-connection',
        apiKeyEncrypted: 'encrypted-fake-key',
        maxTokens: 20,
      },
      {
        system: 'Respond with ok: true',
        prompt: 'Test connection',
        schemaName: 'TestConnection',
        schema: z.object({ ok: z.boolean() }),
      },
    )).resolves.toMatchObject({
      object: { ok: true },
      usage: { promptTokens: expect.any(Number), completionTokens: expect.any(Number) },
    })
  })

  it('returns local generated criteria for criteria generation', async () => {
    const { generateStructuredOutput } = await loadProviderWithMockEnv(capturePath)

    const result = await generateStructuredOutput(
      {
        provider: 'openai',
        model: 'factory-e2e-criteria',
        apiKeyEncrypted: 'encrypted-fake-key',
        maxTokens: 2048,
      },
      {
        system: 'Generate safe scoring criteria.',
        prompt: 'Job Title: Client Services Lead',
        schemaName: 'GeneratedCriteria',
        schema: z.object({
          criteria: z.array(z.object({
            key: z.string(),
            name: z.string(),
            description: z.string(),
            category: z.enum(['technical', 'experience', 'soft_skills', 'education', 'culture', 'custom']),
            maxScore: z.number().int().min(1).max(10),
            suggestedWeight: z.number().int().min(10).max(100),
          })),
        }),
      },
    )

    expect(result.object.criteria).toContainEqual(expect.objectContaining({
      key: 'domain_relevance',
      name: 'Factory Domain Relevance',
      category: 'experience',
      maxScore: 10,
    }))
  })
})
