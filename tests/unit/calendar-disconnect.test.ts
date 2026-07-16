import { beforeEach, describe, expect, it, vi } from 'vitest'

const calendarProviderMocks = vi.hoisted(() => ({
  removeGoogleCalendarIntegration: vi.fn(),
  removeMicrosoftCalendarIntegration: vi.fn(),
}))

vi.mock('../../server/utils/google-calendar', () => ({
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  cancelCalendarEvent: vi.fn(),
  removeCalendarIntegration: calendarProviderMocks.removeGoogleCalendarIntegration,
  setupCalendarWebhook: vi.fn(),
  isGoogleCalendarConfigured: vi.fn(() => true),
}))

vi.mock('../../server/utils/microsoft-calendar', () => ({
  createMicrosoftCalendarEvents: vi.fn(),
  updateMicrosoftCalendarEvent: vi.fn(),
  cancelMicrosoftCalendarEvent: vi.fn(),
  updateMicrosoftMailboxCalendarEvent: vi.fn(),
  cancelMicrosoftMailboxCalendarEvent: vi.fn(),
  removeMicrosoftCalendarIntegration: calendarProviderMocks.removeMicrosoftCalendarIntegration,
  isMicrosoftCalendarConfigured: vi.fn(() => true),
  isMicrosoftCalendarApplicationMode: vi.fn(() => false),
}))

vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string }) =>
  Object.assign(new Error(options.statusMessage), options),
)

describe('calendar disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    calendarProviderMocks.removeGoogleCalendarIntegration.mockResolvedValue(true)
    calendarProviderMocks.removeMicrosoftCalendarIntegration.mockResolvedValue(true)
  })

  it('removes only the connected org Microsoft integration when one exists', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({
        id: 'microsoft-org-row',
        provider: 'microsoft',
        userId: null,
        organizationId: 'org-1',
        connectionGeneration: 'microsoft-generation',
      })

    vi.stubGlobal('db', {
      query: {
        calendarIntegration: { findFirst },
      },
    })

    const { removeConnectedCalendarIntegration } = await import('../../server/utils/calendar')

    await removeConnectedCalendarIntegration('user-1', 'org-1')

    expect(calendarProviderMocks.removeMicrosoftCalendarIntegration).toHaveBeenCalledWith({
      integrationId: 'microsoft-org-row',
      userId: null,
      organizationId: 'org-1',
      connectionGeneration: 'microsoft-generation',
    })
    expect(calendarProviderMocks.removeGoogleCalendarIntegration).not.toHaveBeenCalled()
  })

  it('does not remove a user Google integration when the connected org integration is Microsoft', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({
        id: 'microsoft-org-row',
        provider: 'microsoft',
        userId: null,
        organizationId: 'org-1',
        connectionGeneration: 'microsoft-generation',
      })

    vi.stubGlobal('db', {
      query: {
        calendarIntegration: { findFirst },
      },
    })

    const { removeConnectedCalendarIntegration } = await import('../../server/utils/calendar')

    await removeConnectedCalendarIntegration('user-1', 'org-1')

    expect(calendarProviderMocks.removeGoogleCalendarIntegration).not.toHaveBeenCalled()
  })

  it('does not fall back to a user Microsoft integration when an org context is present', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        provider: 'microsoft',
        userId: 'user-1',
        organizationId: null,
      })

    vi.stubGlobal('db', {
      query: {
        calendarIntegration: { findFirst },
      },
    })

    const { removeConnectedCalendarIntegration } = await import('../../server/utils/calendar')

    await removeConnectedCalendarIntegration('user-1', 'org-1')

    expect(calendarProviderMocks.removeMicrosoftCalendarIntegration).not.toHaveBeenCalled()
    expect(calendarProviderMocks.removeGoogleCalendarIntegration).not.toHaveBeenCalled()
  })

  it('does not fall back to a user Google integration when an org context is present', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        provider: 'google',
        userId: 'user-1',
        organizationId: null,
      })

    vi.stubGlobal('db', {
      query: {
        calendarIntegration: { findFirst },
      },
    })

    const { removeConnectedCalendarIntegration } = await import('../../server/utils/calendar')

    await removeConnectedCalendarIntegration('user-1', 'org-1')

    expect(calendarProviderMocks.removeGoogleCalendarIntegration).not.toHaveBeenCalled()
    expect(calendarProviderMocks.removeMicrosoftCalendarIntegration).not.toHaveBeenCalled()
  })

  it('retains user Microsoft fallback only without an organization context', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce({
      id: 'microsoft-user-row',
      provider: 'microsoft',
      userId: 'user-1',
      organizationId: null,
      connectionGeneration: 'user-generation',
    })
    vi.stubGlobal('db', { query: { calendarIntegration: { findFirst } } })

    const { removeConnectedCalendarIntegration } = await import('../../server/utils/calendar')
    await removeConnectedCalendarIntegration('user-1')

    expect(calendarProviderMocks.removeMicrosoftCalendarIntegration).toHaveBeenCalledWith({
      integrationId: 'microsoft-user-row',
      userId: 'user-1',
      organizationId: null,
      connectionGeneration: 'user-generation',
    })
  })

  it('retains exact user Google fallback only without an organization context', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'google-user-row',
        provider: 'google',
        userId: 'user-1',
        organizationId: null,
        connectionGeneration: 'google-generation',
      })
    vi.stubGlobal('db', { query: { calendarIntegration: { findFirst } } })

    const { removeConnectedCalendarIntegration } = await import('../../server/utils/calendar')
    await removeConnectedCalendarIntegration('user-1')

    expect(calendarProviderMocks.removeGoogleCalendarIntegration).toHaveBeenCalledWith({
      integrationId: 'google-user-row',
      userId: 'user-1',
      organizationId: null,
      connectionGeneration: 'google-generation',
    })
  })

  it('returns a conflict instead of false success when reconnect wins the disconnect CAS', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce({
      id: 'google-raced-row',
      provider: 'google',
      userId: 'user-1',
      organizationId: 'org-1',
      connectionGeneration: 'connection-before-reconnect',
    })
    vi.stubGlobal('db', { query: { calendarIntegration: { findFirst } } })
    calendarProviderMocks.removeGoogleCalendarIntegration.mockResolvedValueOnce(false)

    const { removeConnectedCalendarIntegration } = await import('../../server/utils/calendar')
    await expect(removeConnectedCalendarIntegration('user-1', 'org-1'))
      .rejects.toMatchObject({ statusCode: 409 })
  })
})
