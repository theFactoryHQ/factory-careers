import { describe, expect, it } from 'vitest'
import { admin, member, owner, statements } from '../../shared/permissions'
import { createAiConfigSchema, updateAiConfigSchema } from '../../server/utils/schemas/scoring'

describe('security issue regressions: permissions', () => {
  it('keeps organization deletion owner-only', () => {
    expect(owner.statements.organization).toContain('delete')
    expect(admin.statements.organization).not.toContain('delete')
    expect(member.statements.organization).not.toContain('delete')
  })

  it('separates AI configuration management from scoring permissions', () => {
    expect(statements).toHaveProperty('aiConfig')
    expect(owner.statements.aiConfig).toEqual(expect.arrayContaining(['create', 'read', 'update', 'delete']))
    expect(admin.statements.aiConfig).toEqual(expect.arrayContaining(['create', 'read', 'update', 'delete']))
    expect(member.statements.aiConfig ?? []).toHaveLength(0)

    expect(member.statements.scoring).toEqual(expect.arrayContaining(['create', 'read']))
  })
})

describe('security issue regressions: AI provider base URLs', () => {
  const basePayload = {
    name: 'Custom provider',
    provider: 'openai_compatible' as const,
    model: 'custom-model',
    apiKey: 'test-key',
  }

  it('accepts HTTPS custom provider endpoints', () => {
    const result = createAiConfigSchema.safeParse({
      ...basePayload,
      baseUrl: 'https://llm.example.com/v1',
    })

    expect(result.success).toBe(true)
  })

  it('rejects non-HTTPS public endpoints', () => {
    const result = createAiConfigSchema.safeParse({
      ...basePayload,
      baseUrl: 'http://llm.example.com/v1',
    })

    expect(result.success).toBe(false)
  })

  it('rejects loopback and private-network endpoints', () => {
    for (const baseUrl of [
      'http://localhost:11434/v1',
      'http://127.0.0.1:11434/v1',
      'http://[::1]:11434/v1',
      'https://10.0.0.5/v1',
      'https://172.16.10.5/v1',
      'https://192.168.1.10/v1',
      'https://169.254.169.254/latest/meta-data/',
      'https://metadata.google.internal/computeMetadata/v1/',
    ]) {
      expect(
        createAiConfigSchema.safeParse({ ...basePayload, baseUrl }).success,
        `Expected ${baseUrl} to be rejected`,
      ).toBe(false)
    }
  })

  it('rejects URLs containing credentials', () => {
    const result = updateAiConfigSchema.safeParse({
      baseUrl: 'https://user:password@llm.example.com/v1',
    })

    expect(result.success).toBe(false)
  })
})
