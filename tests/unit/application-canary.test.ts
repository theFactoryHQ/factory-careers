import { describe, expect, it, vi } from 'vitest'
import {
  buildCanaryQuestionResponses,
  executeApplicationCanary,
  validateApplicationCanaryIdentity,
} from '../../server/utils/applicationCanary'

describe('application canary identity', () => {
  it('accepts only the configured slug and generated example.com address', () => {
    expect(validateApplicationCanaryIdentity({
      slug: 'general-interest',
      configuredSlug: 'general-interest',
      email: 'factory-careers-canary+20260814@example.com',
    })).toBe(true)
    expect(validateApplicationCanaryIdentity({
      slug: 'accountant',
      configuredSlug: 'general-interest',
      email: 'factory-careers-canary+20260814@example.com',
    })).toBe(false)
    expect(validateApplicationCanaryIdentity({
      slug: 'general-interest',
      configuredSlug: 'general-interest',
      email: 'real-person@gmail.com',
    })).toBe(false)
  })
})

describe('application canary request', () => {
  it('builds deterministic answers for required public question types', () => {
    expect(buildCanaryQuestionResponses([
      { id: 'long', type: 'long_text', required: true, options: null },
      { id: 'select', type: 'select', required: true, options: ['One', 'Two'] },
      { id: 'optional', type: 'text', required: false, options: null },
    ])).toEqual([
      { questionId: 'long', value: 'Factory Careers synthetic application canary' },
      { questionId: 'select', value: 'One' },
    ])
  })

  it('submits multipart data through the public application endpoint with canary authentication', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (init?.method !== 'POST') {
        expect(init?.signal).toBeInstanceOf(AbortSignal)
        return new Response(JSON.stringify({
          requireResume: true,
          questions: [{ id: 'question-1', type: 'long_text', required: true, options: null }],
        }), { status: 200 })
      }
      expect(url).toBe('https://careers.example.com/api/public/jobs/general-interest/apply')
      expect(init.method).toBe('POST')
      expect(init.headers).toEqual({
        'x-cron-secret': 'cron-secret',
        'x-factory-canary': '1',
      })
      expect(init.body).toBeInstanceOf(FormData)
      expect(init.signal).toBeInstanceOf(AbortSignal)
      return new Response(JSON.stringify({ ok: true, code: 'application_canary_passed' }), { status: 200 })
    })

    await expect(executeApplicationCanary({
      baseUrl: 'https://careers.example.com',
      slug: 'general-interest',
      secret: 'cron-secret',
      email: 'factory-careers-canary+fixed@example.com',
      fetchFn,
    })).resolves.toEqual({ ok: true, code: 'application_canary_passed' })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
