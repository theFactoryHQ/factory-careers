import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSsoStorageReadiness,
  markSsoStorageFailed,
  markSsoStorageReady,
  resetSsoStorageReadiness,
} from '../../server/utils/ssoReadiness'

describe('SSO storage readiness state', () => {
  beforeEach(() => resetSsoStorageReadiness())

  it('stays unready until validation succeeds and returns no failure details', () => {
    expect(getSsoStorageReadiness()).toEqual({ ready: false })

    markSsoStorageFailed(new Error('ciphertext and credential details'))
    expect(getSsoStorageReadiness()).toEqual({ ready: false })

    markSsoStorageReady()
    expect(getSsoStorageReadiness()).toEqual({ ready: true })
  })
})

describe('/api/readyz SSO gate', () => {
  beforeEach(() => {
    resetSsoStorageReadiness()
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('setResponseHeader', vi.fn())
    vi.stubGlobal('createError', (input: Record<string, unknown>) => input)
    vi.stubGlobal('db', {
      execute: vi.fn(async () => [{ ready: true }]),
    })
  })

  it('returns a generic 503 before SSO storage validation succeeds', async () => {
    const { default: handler } = await import('../../server/api/readyz.get')

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Application is not ready',
    })
  })

  it('returns the unchanged success body after database and SSO readiness', async () => {
    markSsoStorageReady()
    const { default: handler } = await import('../../server/api/readyz.get')

    await expect(handler({} as never)).resolves.toEqual({ ok: true })
  })
})
