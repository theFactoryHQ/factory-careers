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
const sendRedirectMock = vi.fn(async (_event, location: string) => ({ location }))
vi.stubGlobal('sendRedirect', sendRedirectMock)

const microsoftConnect = (await import('../../server/api/calendar/microsoft/connect.get')).default as
  (event: unknown) => Promise<unknown>
const microsoftCallback = (await import('../../server/api/calendar/microsoft/callback.get')).default as
  (event: unknown) => Promise<unknown>
const disconnect = (await import('../../server/api/calendar/disconnect.post')).default as
  (event: unknown) => Promise<unknown>

describe('organization-wide calendar mutation authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    providerMocks.exchangeMicrosoftCodeForTokens.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      email: 'calendar@example.com',
    })
    providerMocks.saveMicrosoftCalendarIntegration.mockResolvedValue(undefined)
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

  it.each([
    ['missing', undefined],
    ['mismatched', 'org-other'],
  ])('rejects a %s Microsoft OAuth organization cookie before provider work', async (_label, cookieOrg) => {
    requirePermissionMock.mockResolvedValue({
      user: { id: 'user-1' },
      session: { activeOrganizationId: 'org-active' },
    })
    providerMocks.handleCalendarOAuthCallback.mockImplementation(async (_event, options) => {
      await options.onSuccess({
        code: 'authorization-code',
        extraCookies: { mscal_oauth_org: cookieOrg },
      })
    })

    await expect(microsoftCallback({})).rejects.toThrow(
      'Microsoft Calendar organization changed during authorization',
    )
    expect(providerMocks.exchangeMicrosoftCodeForTokens).not.toHaveBeenCalled()
    expect(providerMocks.saveMicrosoftCalendarIntegration).not.toHaveBeenCalled()
  })

  it('saves Microsoft OAuth credentials only for the matching authorized organization', async () => {
    requirePermissionMock.mockResolvedValue({
      user: { id: 'user-1' },
      session: { activeOrganizationId: 'org-active' },
    })
    providerMocks.handleCalendarOAuthCallback.mockImplementation(async (_event, options) => {
      await options.onSuccess({
        code: 'authorization-code',
        extraCookies: { mscal_oauth_org: 'org-active' },
      })
    })

    await microsoftCallback({})

    expect(providerMocks.saveMicrosoftCalendarIntegration).toHaveBeenCalledWith(
      'user-1',
      'org-active',
      expect.objectContaining({ accessToken: 'access' }),
    )
  })

  it('keeps Microsoft application-mode GET connection handling read-only', async () => {
    requirePermissionMock.mockResolvedValue({
      user: { id: 'user-1', email: 'admin@example.com' },
      session: { activeOrganizationId: 'org-active' },
    })
    providerMocks.isMicrosoftCalendarApplicationMode.mockReturnValueOnce(true)

    await microsoftConnect({})

    expect(providerMocks.enableMicrosoftCalendarAppIntegration).not.toHaveBeenCalled()
    expect(providerMocks.initiateCalendarOAuth).not.toHaveBeenCalled()
    expect(sendRedirectMock).toHaveBeenCalledWith(
      {},
      '/dashboard/settings/integrations?success=connected&provider=microsoft',
    )
  })
})
