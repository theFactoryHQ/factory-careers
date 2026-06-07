import { describe, expect, it } from 'vitest'
import { H3Error } from 'h3'
import { toPublicAiConfig } from '../../server/utils/ai/publicConfig'
import { findOrgScopedOr404 } from '../../server/utils/orgScope'
import {
  entityPropertyParamsSchema,
  resourceIdParamSchema,
  uuidParamSchema,
} from '../../server/utils/schemas/common'

describe('common route param schemas', () => {
  it('accepts non-empty resource ids', () => {
    expect(resourceIdParamSchema.parse({ id: 'job_123' })).toEqual({ id: 'job_123' })
  })

  it('rejects empty resource ids', () => {
    expect(() => resourceIdParamSchema.parse({ id: '' })).toThrow()
  })

  it('accepts valid UUID params', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    expect(uuidParamSchema.parse({ id })).toEqual({ id })
  })

  it('rejects invalid UUID params', () => {
    expect(() => uuidParamSchema.parse({ id: 'not-a-uuid' })).toThrow()
  })

  it('accepts entity property route params', () => {
    expect(entityPropertyParamsSchema.parse({ id: 'cand_1', propId: 'prop_1' })).toEqual({
      id: 'cand_1',
      propId: 'prop_1',
    })
  })
})

describe('toPublicAiConfig', () => {
  it('strips the encrypted key and normalizes pricing fields', () => {
    const row = {
      id: 'cfg_1',
      name: 'Primary',
      provider: 'openai',
      model: 'gpt-4o',
      baseUrl: null,
      maxTokens: 4096,
      inputPricePer1m: '1.25',
      outputPricePer1m: '5.00',
      isDefaultChatbot: true,
      isDefaultAnalysis: false,
      apiKeyEncrypted: 'enc_value',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    }

    expect(toPublicAiConfig(row)).toEqual({
      id: 'cfg_1',
      name: 'Primary',
      provider: 'openai',
      model: 'gpt-4o',
      baseUrl: null,
      maxTokens: 4096,
      inputPricePer1m: 1.25,
      outputPricePer1m: 5,
      isDefaultChatbot: true,
      isDefaultAnalysis: false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      hasApiKey: true,
    })
  })

  it('returns null pricing and hasApiKey false when no key is stored', () => {
    expect(toPublicAiConfig({
      id: 'cfg_2',
      apiKeyEncrypted: null,
      inputPricePer1m: null,
      outputPricePer1m: null,
    })).toMatchObject({
      inputPricePer1m: null,
      outputPricePer1m: null,
      hasApiKey: false,
    })
  })
})

describe('findOrgScopedOr404', () => {
  it('returns the row when present', async () => {
    await expect(findOrgScopedOr404(Promise.resolve({ id: 'link_1' }))).resolves.toEqual({ id: 'link_1' })
  })

  it('throws a 404 with the provided message when missing', async () => {
    await expect(findOrgScopedOr404(Promise.resolve(undefined), 'Tracking link not found')).rejects.toThrow(H3Error)

    try {
      await findOrgScopedOr404(Promise.resolve(undefined), 'Tracking link not found')
    } catch (error) {
      expect((error as H3Error).statusCode).toBe(404)
      expect((error as H3Error).statusMessage).toBe('Tracking link not found')
    }
  })
})