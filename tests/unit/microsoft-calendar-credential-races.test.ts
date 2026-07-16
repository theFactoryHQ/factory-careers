import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => {
  const findFirst = vi.fn()
  const updateReturning = vi.fn()
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  return {
    findFirst,
    updateReturning,
    updateWhere,
    updateSet,
    db: {
      query: {
        calendarIntegration: { findFirst },
        orgSettings: { findFirst: vi.fn() },
      },
      update: vi.fn(() => ({ set: updateSet })),
    },
  }
})

vi.mock('../../server/utils/db', () => ({ db: dbMocks.db }))
vi.mock('../../server/utils/env', () => ({
  env: {
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'https://careers.example.com',
    FACTORY_CAREERS_CALENDAR_GROUP_ID: 'group-configured',
    FACTORY_CAREERS_CALENDAR_EMAIL: 'calendar@example.com',
    MICROSOFT_CALENDAR_AUTH_MODE: 'delegated',
    MICROSOFT_CALENDAR_CLIENT_ID: 'client-id',
    MICROSOFT_CALENDAR_CLIENT_SECRET: 'client-secret',
    MICROSOFT_CALENDAR_TENANT_ID: 'tenant-id',
  },
}))
vi.mock('../../server/utils/encryption', () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => `decrypted:${value}`),
}))

vi.stubGlobal('logError', vi.fn())
vi.stubGlobal('logWarn', vi.fn())

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', fetchMock)

const { createMicrosoftCalendarEvent } = await import('../../server/utils/microsoft-calendar')

const eventData = {
  title: 'Interview',
  description: 'Description',
  startTime: new Date('2026-07-16T12:00:00.000Z'),
  durationMinutes: 30,
  timezone: 'UTC',
  location: null,
  candidateEmail: 'candidate@example.com',
  candidateName: 'Candidate',
  interviewerEmails: [],
}

function delegatedIntegration(calendarId = 'group-existing') {
  return {
    id: 'integration-1',
    userId: 'user-1',
    organizationId: 'org-1',
    provider: 'microsoft',
    connectionGeneration: 'connection-old',
    accessTokenEncrypted: 'encrypted:old-access',
    refreshTokenEncrypted: 'encrypted:old-refresh',
    calendarId,
  }
}

describe('Microsoft Calendar credential generation races', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url.includes('/oauth2/v2.0/token')) {
        return { access_token: 'refreshed-access', refresh_token: 'rotated-refresh' }
      }
      if (url.includes('/groups/group-configured?')) {
        return { id: 'group-configured', mail: 'calendar@example.com' }
      }
      if (url.includes('/calendar/events') && init?.method === 'POST') {
        return { id: 'event-1', webLink: 'https://calendar.example/event-1' }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
  })

  it('does not let an in-flight refresh overwrite or use credentials after reconnect wins', async () => {
    dbMocks.findFirst.mockResolvedValueOnce(delegatedIntegration())
    dbMocks.updateReturning.mockResolvedValueOnce([])

    await expect(createMicrosoftCalendarEvent('user-1', 'org-1', eventData)).resolves.toBeNull()

    expect(dbMocks.updateReturning).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/oauth2/v2.0/token')
  })

  it('does not use a resolved group after reconnect wins the lazy calendar-id write', async () => {
    dbMocks.findFirst.mockResolvedValueOnce(delegatedIntegration('primary'))
    dbMocks.updateReturning
      .mockResolvedValueOnce([{ id: 'integration-1' }])
      .mockResolvedValueOnce([])

    await expect(createMicrosoftCalendarEvent('user-1', 'org-1', eventData)).resolves.toBeNull()

    expect(dbMocks.updateReturning).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/calendar/events'))).toBe(false)
  })
})
