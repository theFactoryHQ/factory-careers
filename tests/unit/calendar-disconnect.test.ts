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

describe('calendar disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes only the connected org Microsoft integration when one exists', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({
        provider: 'microsoft',
        userId: null,
        organizationId: 'org-1',
      })

    vi.stubGlobal('db', {
      query: {
        calendarIntegration: { findFirst },
      },
    })

    const { removeConnectedCalendarIntegration } = await import('../../server/utils/calendar')

    await removeConnectedCalendarIntegration('user-1', 'org-1')

    expect(calendarProviderMocks.removeMicrosoftCalendarIntegration).toHaveBeenCalledWith('user-1', 'org-1')
    expect(calendarProviderMocks.removeGoogleCalendarIntegration).not.toHaveBeenCalled()
  })

  it('does not remove a user Google integration when the connected org integration is Microsoft', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({
        provider: 'microsoft',
        userId: null,
        organizationId: 'org-1',
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
      provider: 'microsoft',
      userId: 'user-1',
      organizationId: null,
    })
    vi.stubGlobal('db', { query: { calendarIntegration: { findFirst } } })

    const { removeConnectedCalendarIntegration } = await import('../../server/utils/calendar')
    await removeConnectedCalendarIntegration('user-1')

    expect(calendarProviderMocks.removeMicrosoftCalendarIntegration).toHaveBeenCalledWith('user-1', undefined)
  })

  it('retains exact user Google fallback only without an organization context', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'google-user-row',
        provider: 'google',
        userId: 'user-1',
        organizationId: null,
      })
    vi.stubGlobal('db', { query: { calendarIntegration: { findFirst } } })

    const { removeConnectedCalendarIntegration } = await import('../../server/utils/calendar')
    await removeConnectedCalendarIntegration('user-1')

    expect(calendarProviderMocks.removeGoogleCalendarIntegration).toHaveBeenCalledWith({
      integrationId: 'google-user-row',
      userId: 'user-1',
      organizationId: null,
    })
  })
})
