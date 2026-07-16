import { beforeEach, describe, expect, it, vi } from 'vitest'

const providerMocks = vi.hoisted(() => ({
  updateGoogleCalendarEvent: vi.fn(),
}))

vi.mock('../../server/utils/google-calendar', () => ({
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: providerMocks.updateGoogleCalendarEvent,
  cancelCalendarEvent: vi.fn(),
  removeCalendarIntegration: vi.fn(),
  setupCalendarWebhook: vi.fn(),
  isGoogleCalendarConfigured: vi.fn(() => true),
}))

vi.mock('../../server/utils/microsoft-calendar', () => ({
  createMicrosoftCalendarEvents: vi.fn(),
  updateMicrosoftCalendarEvent: vi.fn(),
  cancelMicrosoftCalendarEvent: vi.fn(),
  updateMicrosoftMailboxCalendarEvent: vi.fn(),
  cancelMicrosoftMailboxCalendarEvent: vi.fn(),
  removeMicrosoftCalendarIntegration: vi.fn(),
  isMicrosoftCalendarConfigured: vi.fn(() => true),
  isMicrosoftCalendarApplicationMode: vi.fn(() => false),
}))

const calendar = await import('../../server/utils/calendar')

describe('calendar integration organization resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not fall back to another organization user row when org resolution misses', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'integration-org-a',
        userId: 'user-multi-org',
        organizationId: 'org-a',
        provider: 'google',
      })
    vi.stubGlobal('db', {
      query: { calendarIntegration: { findFirst } },
    })

    await expect(calendar.getConnectedCalendarIntegration(
      'user-multi-org',
      'org-b',
    )).resolves.toBeNull()

    expect(findFirst).toHaveBeenCalledTimes(2)
  })

  it('does not use a provider-specific user row after an organization miss', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'integration-org-a',
        userId: 'user-multi-org',
        organizationId: 'org-a',
        provider: 'google',
      })
    vi.stubGlobal('db', {
      query: { calendarIntegration: { findFirst } },
    })

    await expect(calendar.updateConnectedCalendarEvent(
      'user-multi-org',
      'org-b',
      'event-1',
      {},
      'google',
    )).resolves.toBeNull()

    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(providerMocks.updateGoogleCalendarEvent).not.toHaveBeenCalled()
  })

  it('retains user-scoped fallback only when no organization context exists', async () => {
    const userGoogleIntegration = {
      id: 'integration-user-google',
      userId: 'user-1',
      organizationId: null,
      provider: 'google',
    }
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(userGoogleIntegration)
    vi.stubGlobal('db', {
      query: { calendarIntegration: { findFirst } },
    })

    await expect(calendar.getConnectedCalendarIntegration('user-1')).resolves.toBe(
      userGoogleIntegration,
    )

    expect(findFirst).toHaveBeenCalledTimes(2)
  })
})
