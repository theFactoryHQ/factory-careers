import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
vi.stubEnv('BETTER_AUTH_SECRET', 'a'.repeat(32))
vi.stubEnv('BETTER_AUTH_URL', 'https://careers.thefactoryhq.com')
vi.stubEnv('S3_ENDPOINT', 'https://s3.example.com')
vi.stubEnv('S3_ACCESS_KEY', 'test-key')
vi.stubEnv('S3_SECRET_KEY', 'test-secret')
vi.stubEnv('S3_BUCKET', 'test-bucket')
delete (globalThis as Record<string, unknown>).__env

type ExecuteSsoHealthRoute = typeof import('../../server/api/operations/sso-health.post').executeSsoHealthRoute
let executeSsoHealthRoute: ExecuteSsoHealthRoute

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (input: Record<string, unknown>) => input)
  ;({ executeSsoHealthRoute } = await import('../../server/api/operations/sso-health.post'))
})

describe('SSO health operations route', () => {
  it.each([undefined, '', 'wrong-secret'])('rejects a missing or invalid cron secret', async (providedSecret) => {
    const probe = vi.fn()

    await expect(executeSsoHealthRoute({
      providedSecret,
      expectedSecret: 'expected-cron-secret-value',
      probe,
    })).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Invalid cron secret' })
    expect(probe).not.toHaveBeenCalled()
  })

  it('returns only the sanitized stable probe result', async () => {
    const response = {
      ok: true as const,
      code: 'healthy' as const,
      checkedAt: '2026-08-10T12:00:00.000Z',
    }

    await expect(executeSsoHealthRoute({
      providedSecret: 'expected-cron-secret-value',
      expectedSecret: 'expected-cron-secret-value',
      probe: vi.fn(async () => response),
    })).resolves.toEqual(response)
  })
})
