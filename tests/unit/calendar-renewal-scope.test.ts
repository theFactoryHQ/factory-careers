import { beforeEach, describe, expect, it, vi } from 'vitest'

const drizzleMocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ operator: 'and', conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ operator: 'eq', column, value })),
  isNull: vi.fn((column: unknown) => ({ operator: 'isNull', column })),
  lt: vi.fn((column: unknown, value: unknown) => ({ operator: 'lt', column, value })),
  or: vi.fn((...conditions: unknown[]) => ({ operator: 'or', conditions })),
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const original = await importOriginal<typeof import('drizzle-orm')>()
  return { ...original, ...drizzleMocks }
})

const setupCalendarWebhookMock = vi.hoisted(() => vi.fn())

vi.mock('../../server/utils/google-calendar', () => ({
  setupCalendarWebhook: setupCalendarWebhookMock,
}))

const requirePermissionMock = vi.fn()
const findManyMock = vi.fn()
const envStub: { CRON_SECRET?: string } = {}

type TestEvent = {
  headers?: Record<string, string | undefined>
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getHeader', (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()])
vi.stubGlobal('requirePermission', requirePermissionMock)
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string }) =>
  Object.assign(new Error(options.statusMessage), options),
)
vi.stubGlobal('env', envStub)
vi.stubGlobal('db', {
  query: {
    calendarIntegration: {
      findMany: findManyMock,
    },
  },
})

const renewWebhooksHandler = (
  await import('../../server/api/calendar/renew-webhooks.post')
).default as (event: TestEvent) => Promise<{ total: number, renewed: number, failed: number }>
const { calendarIntegration } = await import('../../server/database/schema')

describe('calendar webhook renewal scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    delete envStub.CRON_SECRET
    findManyMock.mockResolvedValue([])
    setupCalendarWebhookMock.mockResolvedValue(true)
  })

  it('uses a valid configured cron secret to renew globally without an organization predicate', async () => {
    envStub.CRON_SECRET = 'configured-cron-secret'

    await renewWebhooksHandler({
      headers: { 'x-cron-secret': 'configured-cron-secret' },
    })

    expect(requirePermissionMock).not.toHaveBeenCalled()
    expect(drizzleMocks.eq).toHaveBeenCalledWith(calendarIntegration.provider, 'google')
    expect(drizzleMocks.eq).not.toHaveBeenCalledWith(
      calendarIntegration.organizationId,
      expect.anything(),
    )
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        operator: 'and',
        conditions: [
          {
            operator: 'eq',
            column: calendarIntegration.provider,
            value: 'google',
          },
          expect.objectContaining({
            operator: 'or',
            conditions: expect.arrayContaining([
              { operator: 'isNull', column: calendarIntegration.webhookChannelId },
              { operator: 'isNull', column: calendarIntegration.webhookExpiration },
              expect.objectContaining({ operator: 'lt' }),
            ]),
          }),
        ],
      },
      columns: { id: true, userId: true, organizationId: true },
    }))
  })

  it('scopes an interactive renewal to the exact active organization', async () => {
    const event = {}
    const activeOrganizationId = 'org-authorized-exactly'
    requirePermissionMock.mockResolvedValue({
      session: { activeOrganizationId },
    })
    findManyMock.mockResolvedValue([{
      id: 'integration-interactive',
      userId: 'user-interactive',
      organizationId: activeOrganizationId,
    }])

    await renewWebhooksHandler(event)

    expect(requirePermissionMock).toHaveBeenCalledWith(event, {
      organization: ['update'],
    })
    expect(drizzleMocks.eq).toHaveBeenCalledWith(
      calendarIntegration.organizationId,
      activeOrganizationId,
    )
    expect(drizzleMocks.eq).toHaveBeenCalledWith(calendarIntegration.provider, 'google')
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        operator: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            operator: 'eq',
            value: activeOrganizationId,
          }),
        ]),
      }),
    }))
    expect(setupCalendarWebhookMock).toHaveBeenCalledWith({
      integrationId: 'integration-interactive',
      userId: 'user-interactive',
      organizationId: activeOrganizationId,
    })
  })

  it('retries a connected Google integration whose initial webhook setup is still pending', async () => {
    requirePermissionMock.mockResolvedValue({
      session: { activeOrganizationId: 'org-pending' },
    })
    findManyMock.mockResolvedValue([{
      id: 'integration-pending',
      userId: 'user-pending',
      organizationId: 'org-pending',
    }])

    await expect(renewWebhooksHandler({})).resolves.toEqual({
      total: 1,
      renewed: 1,
      failed: 0,
    })

    expect(drizzleMocks.isNull).toHaveBeenCalledWith(calendarIntegration.webhookChannelId)
    expect(setupCalendarWebhookMock).toHaveBeenCalledWith({
      integrationId: 'integration-pending',
      userId: 'user-pending',
      organizationId: 'org-pending',
    })
  })

  it('does no database or provider work when interactive permission is denied', async () => {
    const forbidden = Object.assign(new Error('Forbidden'), { statusCode: 403 })
    requirePermissionMock.mockRejectedValue(forbidden)

    await expect(renewWebhooksHandler({})).rejects.toBe(forbidden)

    expect(findManyMock).not.toHaveBeenCalled()
    expect(setupCalendarWebhookMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid supplied cron secret before auth, database, or provider work', async () => {
    envStub.CRON_SECRET = 'configured-cron-secret'

    await expect(renewWebhooksHandler({
      headers: { 'x-cron-secret': 'invalid-cron-secret' },
    })).rejects.toMatchObject({
      statusCode: 403,
      message: 'Invalid cron secret',
    })

    expect(requirePermissionMock).not.toHaveBeenCalled()
    expect(findManyMock).not.toHaveBeenCalled()
    expect(setupCalendarWebhookMock).not.toHaveBeenCalled()
  })

  it('rejects a supplied cron secret when CRON_SECRET is not configured', async () => {
    await expect(renewWebhooksHandler({
      headers: { 'x-cron-secret': 'supplied-cron-secret' },
    })).rejects.toMatchObject({
      statusCode: 403,
      message: 'Invalid cron secret',
    })

    expect(requirePermissionMock).not.toHaveBeenCalled()
    expect(findManyMock).not.toHaveBeenCalled()
    expect(setupCalendarWebhookMock).not.toHaveBeenCalled()
  })

  it('preserves the 24-hour threshold and exact renewal result counts', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'))
    envStub.CRON_SECRET = 'configured-cron-secret'
    findManyMock.mockResolvedValue([
      { id: 'integration-renewed', userId: 'user-renewed', organizationId: 'org-a' },
      { id: 'integration-provider-failed', userId: 'user-provider-failed', organizationId: 'org-b' },
      { id: 'integration-provider-threw', userId: 'user-provider-threw', organizationId: null },
      { id: 'integration-without-user', userId: null, organizationId: 'org-c' },
    ])
    setupCalendarWebhookMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('provider unavailable'))

    const result = await renewWebhooksHandler({
      headers: { 'x-cron-secret': 'configured-cron-secret' },
    })

    expect(drizzleMocks.lt).toHaveBeenCalledWith(
      expect.anything(),
      new Date('2026-07-17T12:00:00.000Z'),
    )
    expect(setupCalendarWebhookMock.mock.calls.map(([identity]) => identity)).toEqual([
      {
        integrationId: 'integration-renewed',
        userId: 'user-renewed',
        organizationId: 'org-a',
      },
      {
        integrationId: 'integration-provider-failed',
        userId: 'user-provider-failed',
        organizationId: 'org-b',
      },
      {
        integrationId: 'integration-provider-threw',
        userId: 'user-provider-threw',
        organizationId: null,
      },
    ])
    expect(result).toEqual({ total: 4, renewed: 1, failed: 3 })
  })
})
