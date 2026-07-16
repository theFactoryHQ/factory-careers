import { beforeEach, describe, expect, it, vi } from 'vitest'

const providerMocks = vi.hoisted(() => ({
  enableMicrosoftCalendarAppIntegration: vi.fn(),
  getMicrosoftAuthUrl: vi.fn(),
  isMicrosoftCalendarApplicationMode: vi.fn(() => false),
  isMicrosoftCalendarConfigured: vi.fn(() => true),
  exchangeMicrosoftCodeForTokens: vi.fn(),
  saveMicrosoftCalendarIntegration: vi.fn(),
  isCalendarConfigured: vi.fn(() => true),
  removeConnectedCalendarIntegration: vi.fn(),
  initiateCalendarOAuth: vi.fn(),
  handleCalendarOAuthCallback: vi.fn(),
}))

vi.mock('../../server/utils/microsoft-calendar', () => ({
  enableMicrosoftCalendarAppIntegration: providerMocks.enableMicrosoftCalendarAppIntegration,
  getMicrosoftAuthUrl: providerMocks.getMicrosoftAuthUrl,
  isMicrosoftCalendarApplicationMode: providerMocks.isMicrosoftCalendarApplicationMode,
  isMicrosoftCalendarConfigured: providerMocks.isMicrosoftCalendarConfigured,
  exchangeMicrosoftCodeForTokens: providerMocks.exchangeMicrosoftCodeForTokens,
  saveMicrosoftCalendarIntegration: providerMocks.saveMicrosoftCalendarIntegration,
}))
vi.mock('../../server/utils/calendar', () => ({
  isCalendarConfigured: providerMocks.isCalendarConfigured,
  removeConnectedCalendarIntegration: providerMocks.removeConnectedCalendarIntegration,
}))
vi.mock('../../server/utils/calendarOAuth', () => ({
  initiateCalendarOAuth: providerMocks.initiateCalendarOAuth,
  handleCalendarOAuthCallback: providerMocks.handleCalendarOAuthCallback,
}))

const requirePermissionMock = vi.fn()
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requirePermission', requirePermissionMock)
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string }) =>
  Object.assign(new Error(options.statusMessage), options),
)

const microsoftConnect = (await import('../../server/api/calendar/microsoft/connect.get')).default as
  (event: unknown) => Promise<unknown>
const microsoftCallback = (await import('../../server/api/calendar/microsoft/callback.get')).default as
  (event: unknown) => Promise<unknown>
const disconnect = (await import('../../server/api/calendar/disconnect.post')).default as
  (event: unknown) => Promise<unknown>

describe('organization-wide calendar mutation authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  for (const [name, handler] of [
    ['Microsoft OAuth initiation', microsoftConnect],
    ['Microsoft OAuth callback', microsoftCallback],
    ['calendar disconnect', disconnect],
  ] as const) {
    it(`denies ${name} before provider or database work`, async () => {
      const event = { route: name }
      const forbidden = Object.assign(new Error('Forbidden'), { statusCode: 403 })
      requirePermissionMock.mockRejectedValue(forbidden)

      await expect(handler(event)).rejects.toBe(forbidden)

      expect(requirePermissionMock).toHaveBeenCalledWith(event, {
        organization: ['update'],
      })
      expect(providerMocks.enableMicrosoftCalendarAppIntegration).not.toHaveBeenCalled()
      expect(providerMocks.initiateCalendarOAuth).not.toHaveBeenCalled()
      expect(providerMocks.handleCalendarOAuthCallback).not.toHaveBeenCalled()
      expect(providerMocks.removeConnectedCalendarIntegration).not.toHaveBeenCalled()
    })
  }
})
