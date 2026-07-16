import { beforeEach, describe, expect, it, vi } from 'vitest'

const drizzleMocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ operator: 'and', conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ operator: 'eq', column, value })),
}))
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...await importOriginal<typeof import('drizzle-orm')>(),
  ...drizzleMocks,
}))

const performIncrementalSyncMock = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/google-calendar', () => ({
  performIncrementalSync: performIncrementalSyncMock,
}))

const findFirstMock = vi.fn()
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getHeader', (_event: unknown, name: string) => ({
  'x-goog-channel-id': 'channel-exact',
  'x-goog-resource-state': 'exists',
  'x-goog-resource-id': 'resource-exact',
}[name]))
vi.stubGlobal('setResponseStatus', vi.fn())
vi.stubGlobal('logError', vi.fn())
vi.stubGlobal('db', { query: { calendarIntegration: { findFirst: findFirstMock } } })

const handler = (await import('../../server/api/calendar/webhook.post')).default as
  (event: unknown) => Promise<unknown>
const { calendarIntegration } = await import('../../server/database/schema')

describe('Google Calendar webhook integration scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findFirstMock.mockResolvedValue({
      id: 'integration-exact',
      userId: 'user-exact',
      organizationId: 'org-exact',
      webhookResourceId: 'resource-exact',
    })
    performIncrementalSyncMock.mockResolvedValue(undefined)
  })

  it('filters the public channel lookup to Google and passes exact identity to sync', async () => {
    await handler({})

    expect(findFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        operator: 'and',
        conditions: expect.arrayContaining([
          { operator: 'eq', column: calendarIntegration.webhookChannelId, value: 'channel-exact' },
          { operator: 'eq', column: calendarIntegration.provider, value: 'google' },
        ]),
      },
    }))
    expect(performIncrementalSyncMock).toHaveBeenCalledWith({
      integrationId: 'integration-exact',
      userId: 'user-exact',
      organizationId: 'org-exact',
    })
  })
})
