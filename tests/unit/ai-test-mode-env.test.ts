import { afterEach, describe, expect, it, vi } from 'vitest'
import { envSchema } from '../../server/utils/env'

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'https://app.example.com',
  S3_ENDPOINT: 'https://s3.example.com',
  S3_ACCESS_KEY: 'test-key',
  S3_SECRET_KEY: 'test-secret',
  S3_BUCKET: 'test-bucket',
}

describe('AI E2E test-mode environment safety', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('accepts deterministic mock mode when a capture path is configured outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')

    const result = envSchema.safeParse({
      ...baseEnv,
      FACTORY_AI_TEST_MODE: 'mock',
      FACTORY_AI_CAPTURE_PATH: '/tmp/factory-careers-e2e-ai.jsonl',
    })

    expect(result.success).toBe(true)
  })

  it('requires a capture path for deterministic mock mode', () => {
    vi.stubEnv('NODE_ENV', 'test')

    const result = envSchema.safeParse({
      ...baseEnv,
      FACTORY_AI_TEST_MODE: 'mock',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.message)).toContain(
        'FACTORY_AI_CAPTURE_PATH is required when FACTORY_AI_TEST_MODE=mock.',
      )
    }
  })

  it('rejects deterministic mock mode in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const result = envSchema.safeParse({
      ...baseEnv,
      FACTORY_AI_TEST_MODE: 'mock',
      FACTORY_AI_CAPTURE_PATH: '/tmp/factory-careers-e2e-ai.jsonl',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.message)).toContain(
        'FACTORY_AI_TEST_MODE=mock is not allowed in production.',
      )
    }
  })
})
