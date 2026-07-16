import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => {
  const findFirst = vi.fn()
  const updateReturning = vi.fn()
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const insertValues = vi.fn()
  const deleteFrom = vi.fn()
  const tx = {
    query: { calendarIntegration: { findFirst } },
    update: vi.fn(() => ({ set: updateSet })),
    insert: vi.fn(() => ({ values: insertValues })),
  }
  const db = {
    ...tx,
    query: {
      calendarIntegration: { findFirst },
      orgSettings: { findFirst: vi.fn() },
    },
    delete: deleteFrom,
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      await callback(tx)),
  }
  return {
    db,
    findFirst,
    updateReturning,
    updateWhere,
    updateSet,
    insertValues,
    deleteFrom,
  }
})

vi.mock('../../server/utils/db', () => ({ db: dbMocks.db }))
vi.mock('../../server/utils/env', () => ({
  env: {
    BETTER_AUTH_SECRET: 'test-secret',
    FACTORY_CAREERS_CALENDAR_GROUP_ID: 'group-exact',
    FACTORY_CAREERS_CALENDAR_EMAIL: 'calendar@example.com',
    MICROSOFT_CALENDAR_AUTH_MODE: 'delegated',
  },
}))
vi.mock('../../server/utils/encryption', () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn(),
}))

vi.stubGlobal('$fetch', vi.fn(async () => ({
  id: 'group-exact',
  mail: 'calendar@example.com',
})))
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string }) =>
  Object.assign(new Error(options.statusMessage), options),
)

const { saveMicrosoftCalendarIntegration } = await import('../../server/utils/microsoft-calendar')

const tokens = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  email: 'calendar@example.com',
}

describe('Microsoft Calendar integration organization scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMocks.updateReturning.mockResolvedValue([{ id: 'integration-existing' }])
    dbMocks.insertValues.mockResolvedValue(undefined)
  })

  it('rejects moving a delegated integration between organizations without deleting it', async () => {
    dbMocks.findFirst
      .mockResolvedValueOnce({ id: 'integration-existing', organizationId: 'org-a' })
      .mockResolvedValueOnce(null)

    await expect(saveMicrosoftCalendarIntegration('user-1', 'org-b', tokens))
      .rejects.toMatchObject({ statusCode: 409 })

    expect(dbMocks.deleteFrom).not.toHaveBeenCalled()
    expect(dbMocks.updateSet).not.toHaveBeenCalled()
    expect(dbMocks.insertValues).not.toHaveBeenCalled()
  })

  it('updates a same-organization delegated integration atomically', async () => {
    dbMocks.findFirst
      .mockResolvedValueOnce({ id: 'integration-existing', organizationId: 'org-a' })
      .mockResolvedValueOnce({ id: 'integration-existing', organizationId: 'org-a' })

    await saveMicrosoftCalendarIntegration('user-1', 'org-a', tokens)

    expect(dbMocks.db.transaction).toHaveBeenCalledTimes(1)
    expect(dbMocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-a',
      provider: 'microsoft',
    }))
    expect(dbMocks.deleteFrom).not.toHaveBeenCalled()
  })

  it('translates a concurrent uniqueness conflict without destroying the existing row', async () => {
    dbMocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    dbMocks.insertValues.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }))

    await expect(saveMicrosoftCalendarIntegration('user-1', 'org-a', tokens))
      .rejects.toMatchObject({ statusCode: 409 })

    expect(dbMocks.deleteFrom).not.toHaveBeenCalled()
  })
})
