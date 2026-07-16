import { beforeEach, describe, expect, it, vi } from 'vitest'

const drizzleMocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ operator: 'and', conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ operator: 'eq', column, value })),
  isNull: vi.fn((column: unknown) => ({ operator: 'isNull', column })),
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const original = await importOriginal<typeof import('drizzle-orm')>()
  return { ...original, ...drizzleMocks }
})

const oauthClient = vi.hoisted(() => ({
  setCredentials: vi.fn(),
  on: vi.fn(),
}))
const calendarClient = vi.hoisted(() => ({
  channels: { stop: vi.fn() },
  events: {
    watch: vi.fn(),
    list: vi.fn(),
  },
}))

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: vi.fn(function OAuth2Client() { return oauthClient }) },
    calendar: vi.fn(() => calendarClient),
    oauth2: vi.fn(),
  },
}))

vi.mock('../../server/utils/encryption', () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => `decrypted:${value}`),
}))

const findFirstMock = vi.fn()
const interviewFindFirstMock = vi.fn()
const updateReturningMock = vi.fn()
const updateWhereMock = vi.fn()
updateWhereMock.mockImplementation(() => ({ returning: updateReturningMock }))
const updateSetMock = vi.fn(() => ({ where: updateWhereMock }))
const insertReturningMock = vi.fn()
const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }))
const deleteWhereMock = vi.fn()

vi.stubGlobal('env', {
  BETTER_AUTH_SECRET: 'test-auth-secret',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  BETTER_AUTH_URL: 'https://careers.example.com',
})
const transactionClient = {
  query: {
    calendarIntegration: { findFirst: findFirstMock },
    interview: { findFirst: interviewFindFirstMock },
  },
  update: vi.fn(() => ({ set: updateSetMock })),
  insert: vi.fn(() => ({ values: insertValuesMock })),
  delete: vi.fn(() => ({ where: deleteWhereMock })),
}
vi.stubGlobal('db', {
  ...transactionClient,
  transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
    await callback(transactionClient)),
})
vi.stubGlobal('logError', vi.fn())
vi.stubGlobal('logWarn', vi.fn())
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string }) =>
  Object.assign(new Error(options.statusMessage), options),
)

const googleCalendar = await import('../../server/utils/google-calendar')
const { calendarIntegration } = await import('../../server/database/schema')

type SaveCalendarIntegration = (
  userId: string,
  organizationId: string,
  params: { accessToken: string, refreshToken: string, email: string | null },
) => Promise<{
  integrationId: string
  userId: string
  organizationId: string | null
}>

type SetupCalendarWebhook = (identity: {
  integrationId: string
  userId: string
  organizationId: string | null
}) => Promise<boolean>

type PerformIncrementalSync = (identity: {
  integrationId: string
  userId: string
  organizationId: string | null
}) => Promise<void>

const saveCalendarIntegration = googleCalendar.saveCalendarIntegration as unknown as SaveCalendarIntegration
const setupCalendarWebhook = googleCalendar.setupCalendarWebhook as unknown as SetupCalendarWebhook
const performIncrementalSync = googleCalendar.performIncrementalSync as unknown as PerformIncrementalSync
const { interview } = await import('../../server/database/schema')

function expectExactGoogleScope(
  expression: unknown,
  identity: { integrationId: string, userId: string, organizationId: string | null },
) {
  expect(expression).toEqual(expect.objectContaining({
    operator: 'and',
    conditions: expect.arrayContaining([
      { operator: 'eq', column: calendarIntegration.id, value: identity.integrationId },
      { operator: 'eq', column: calendarIntegration.userId, value: identity.userId },
      { operator: 'eq', column: calendarIntegration.provider, value: 'google' },
      ...(identity.organizationId
        ? [{ operator: 'eq', column: calendarIntegration.organizationId, value: identity.organizationId }]
        : [{ operator: 'isNull', column: calendarIntegration.organizationId }]),
    ]),
  }))
}

describe('Google Calendar integration identity scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateReturningMock.mockResolvedValue([{ id: 'integration-existing' }])
    insertReturningMock.mockResolvedValue([{ id: 'integration-inserted' }])
    deleteWhereMock.mockResolvedValue([])
    calendarClient.channels.stop.mockResolvedValue({})
    calendarClient.events.watch.mockResolvedValue({
      data: { resourceId: 'resource-exact', expiration: '1780000000000' },
    })
    calendarClient.events.list.mockResolvedValue({ data: { items: [] } })
  })

  it('binds an existing Google integration to the active organization and returns its exact id', async () => {
    findFirstMock
      .mockResolvedValueOnce({ id: 'integration-existing', organizationId: 'org-active' })
      .mockResolvedValueOnce({ id: 'integration-existing', organizationId: 'org-active' })

    const integrationId = await saveCalendarIntegration('user-1', 'org-active', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      email: 'calendar@example.com',
    })

    expect(updateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-active',
    }))
    expect(updateWhereMock).toHaveBeenCalledWith(expect.objectContaining({
      operator: 'and',
      conditions: expect.arrayContaining([
        { operator: 'eq', column: calendarIntegration.id, value: 'integration-existing' },
        { operator: 'eq', column: calendarIntegration.userId, value: 'user-1' },
        { operator: 'eq', column: calendarIntegration.provider, value: 'google' },
      ]),
    }))
    expect(integrationId).toEqual({
      integrationId: 'integration-existing',
      userId: 'user-1',
      organizationId: 'org-active',
    })
  })

  it('inserts a new Google integration with organization ownership and returns its exact id', async () => {
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    const integrationId = await saveCalendarIntegration('user-1', 'org-active', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      email: null,
    })

    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      organizationId: 'org-active',
      provider: 'google',
    }))
    expect(deleteWhereMock).not.toHaveBeenCalled()
    expect(integrationId).toEqual({
      integrationId: 'integration-inserted',
      userId: 'user-1',
      organizationId: 'org-active',
    })
  })

  it('rejects moving an existing Google integration between organizations', async () => {
    findFirstMock
      .mockResolvedValueOnce({ id: 'integration-existing', organizationId: 'org-a' })
      .mockResolvedValueOnce(null)

    await expect(saveCalendarIntegration('user-1', 'org-b', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      email: null,
    })).rejects.toMatchObject({ statusCode: 409 })

    expect(updateSetMock).not.toHaveBeenCalled()
    expect(insertValuesMock).not.toHaveBeenCalled()
  })

  it('rejects overwriting an organization integration owned by another row', async () => {
    findFirstMock
      .mockResolvedValueOnce({ id: 'integration-user', organizationId: null })
      .mockResolvedValueOnce({ id: 'integration-org', organizationId: 'org-active' })

    await expect(saveCalendarIntegration('user-1', 'org-active', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      email: null,
    })).rejects.toMatchObject({ statusCode: 409 })

    expect(updateSetMock).not.toHaveBeenCalled()
    expect(insertValuesMock).not.toHaveBeenCalled()
  })

  it('claims an unowned legacy row only through its exact null-owned identity', async () => {
    findFirstMock
      .mockResolvedValueOnce({ id: 'integration-legacy', organizationId: null })
      .mockResolvedValueOnce(null)

    await expect(saveCalendarIntegration('user-1', 'org-active', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      email: null,
    })).resolves.toEqual({
      integrationId: 'integration-legacy',
      userId: 'user-1',
      organizationId: 'org-active',
    })

    expect(updateWhereMock).toHaveBeenCalledWith(expect.objectContaining({
      operator: 'and',
      conditions: expect.arrayContaining([
        { operator: 'isNull', column: calendarIntegration.organizationId },
      ]),
    }))
  })

  it('translates a concurrent uniqueness race into a stable conflict', async () => {
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    insertReturningMock.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }))

    await expect(saveCalendarIntegration('user-1', 'org-active', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      email: null,
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('reads and updates webhook metadata through the exact interactive integration scope', async () => {
    const identity = {
      integrationId: 'integration-exact',
      userId: 'user-exact',
      organizationId: 'org-exact',
    }
    findFirstMock.mockResolvedValue({
      id: identity.integrationId,
      userId: identity.userId,
      organizationId: identity.organizationId,
      provider: 'google',
      accessTokenEncrypted: 'stored-access',
      refreshTokenEncrypted: 'stored-refresh',
      calendarId: 'primary',
      webhookChannelId: null,
      webhookResourceId: null,
      syncToken: null,
    })

    await expect(setupCalendarWebhook(identity)).resolves.toBe(true)

    expect(findFirstMock).toHaveBeenCalled()
    for (const [{ where }] of findFirstMock.mock.calls) {
      expectExactGoogleScope(where, identity)
    }
    expect(updateWhereMock).toHaveBeenCalled()
    for (const [where] of updateWhereMock.mock.calls) {
      expectExactGoogleScope(where, identity)
    }
  })

  it('keeps a legacy null-owned cron integration constrained to null ownership', async () => {
    const identity = {
      integrationId: 'integration-legacy',
      userId: 'user-legacy',
      organizationId: null,
    }
    findFirstMock.mockResolvedValue({
      id: identity.integrationId,
      userId: identity.userId,
      organizationId: null,
      provider: 'google',
      accessTokenEncrypted: 'stored-access',
      refreshTokenEncrypted: 'stored-refresh',
      calendarId: 'primary',
      webhookChannelId: null,
      webhookResourceId: null,
      syncToken: null,
    })

    await expect(setupCalendarWebhook(identity)).resolves.toBe(true)

    for (const [{ where }] of findFirstMock.mock.calls) {
      expectExactGoogleScope(where, identity)
    }
    for (const [where] of updateWhereMock.mock.calls) {
      expectExactGoogleScope(where, identity)
    }
  })

  it('stops a newly-created channel when the compare-and-set update loses a race', async () => {
    const identity = {
      integrationId: 'integration-raced',
      userId: 'user-raced',
      organizationId: 'org-raced',
    }
    findFirstMock.mockResolvedValue({
      id: identity.integrationId,
      userId: identity.userId,
      organizationId: identity.organizationId,
      provider: 'google',
      accessTokenEncrypted: 'stored-access',
      refreshTokenEncrypted: 'stored-refresh',
      calendarId: 'primary',
      webhookChannelId: 'previous-channel',
      webhookResourceId: 'previous-resource',
      syncToken: null,
    })
    updateReturningMock.mockResolvedValueOnce([])

    await expect(setupCalendarWebhook(identity)).resolves.toBe(false)

    expect(calendarClient.channels.stop).toHaveBeenCalledWith({
      requestBody: {
        id: expect.any(String),
        resourceId: 'resource-exact',
      },
    })
  })

  it('scopes attendee synchronization to the integration organization', async () => {
    const identity = {
      integrationId: 'integration-sync',
      userId: 'user-sync',
      organizationId: 'org-sync',
    }
    findFirstMock.mockResolvedValue({
      id: identity.integrationId,
      userId: identity.userId,
      organizationId: identity.organizationId,
      provider: 'google',
      accessTokenEncrypted: 'stored-access',
      refreshTokenEncrypted: 'stored-refresh',
      calendarId: 'primary',
      syncToken: null,
    })
    calendarClient.events.list.mockResolvedValue({
      data: { items: [{ id: 'event-shared-provider-id' }] },
    })
    interviewFindFirstMock.mockResolvedValue(null)

    await performIncrementalSync(identity)

    expect(interviewFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        operator: 'and',
        conditions: expect.arrayContaining([
          { operator: 'eq', column: interview.googleCalendarEventId, value: 'event-shared-provider-id' },
          { operator: 'eq', column: interview.organizationId, value: 'org-sync' },
        ]),
      }),
    }))
  })
})
