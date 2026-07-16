import { beforeEach, describe, expect, it, vi } from 'vitest'

const googleCalendarMocks = vi.hoisted(() => ({
  exchangeCodeForTokens: vi.fn(),
  saveCalendarIntegration: vi.fn(),
  setupCalendarWebhook: vi.fn(),
  getGoogleAuthUrl: vi.fn(),
  isGoogleCalendarConfigured: vi.fn(),
}))

vi.mock('../../server/utils/google-calendar', () => googleCalendarMocks)

const handleCalendarOAuthCallbackMock = vi.hoisted(() => vi.fn())
const initiateCalendarOAuthMock = vi.hoisted(() => vi.fn())

vi.mock('../../server/utils/calendarOAuth', () => ({
  handleCalendarOAuthCallback: handleCalendarOAuthCallbackMock,
  initiateCalendarOAuth: initiateCalendarOAuthMock,
}))

const requireAuthMock = vi.fn()
const requirePermissionMock = vi.fn()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requireAuth', requireAuthMock)
vi.stubGlobal('requirePermission', requirePermissionMock)
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string }) =>
  Object.assign(new Error(options.statusMessage), options),
)
vi.stubGlobal('logWarn', vi.fn())

const callbackHandler = (
  await import('../../server/api/calendar/google/callback.get')
).default as (event: unknown) => Promise<unknown>
const connectHandler = (
  await import('../../server/api/calendar/google/connect.get')
).default as (event: unknown) => Promise<unknown>

describe('Google Calendar OAuth callback organization scope', () => {
  function mockAuthorizedSession(session: unknown) {
    requireAuthMock.mockResolvedValue(session)
    requirePermissionMock.mockResolvedValue(session)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    googleCalendarMocks.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      email: 'calendar@example.com',
    })
    googleCalendarMocks.saveCalendarIntegration.mockResolvedValue({
      integrationId: 'integration-exact',
      userId: 'user-1',
      organizationId: 'org-active',
    })
    googleCalendarMocks.setupCalendarWebhook.mockResolvedValue(true)
    googleCalendarMocks.isGoogleCalendarConfigured.mockReturnValue(true)
    initiateCalendarOAuthMock.mockResolvedValue({ redirected: true })
    handleCalendarOAuthCallbackMock.mockImplementation(async (_event, options) => {
      await options.onSuccess({
        code: 'authorization-code',
        extraCookies: { gcal_oauth_org: 'org-active' },
      })
      return { redirected: true }
    })
  })

  it('binds Google OAuth initiation to the exact active organization cookie', async () => {
    mockAuthorizedSession({
      user: { id: 'user-1' },
      session: { activeOrganizationId: 'org-active' },
    })

    await connectHandler({})

    expect(requirePermissionMock).toHaveBeenCalledWith({}, {
      organization: ['update'],
    })
    expect(initiateCalendarOAuthMock).toHaveBeenCalledWith({}, expect.objectContaining({
      stateCookieName: 'gcal_oauth_state',
      extraCookies: [{ name: 'gcal_oauth_org', value: 'org-active' }],
    }))
  })

  it('fails closed before OAuth initiation when no active organization is present', async () => {
    mockAuthorizedSession({
      user: { id: 'user-1' },
      session: { activeOrganizationId: null },
    })

    await expect(connectHandler({})).rejects.toMatchObject({
      statusCode: 403,
      message: 'No active organization',
    })

    expect(initiateCalendarOAuthMock).not.toHaveBeenCalled()
  })

  it('fails closed before provider work when the authenticated session has no active organization', async () => {
    mockAuthorizedSession({
      user: { id: 'user-1' },
      session: { activeOrganizationId: null },
    })

    await expect(callbackHandler({})).rejects.toMatchObject({
      statusCode: 403,
      message: 'No active organization',
    })

    expect(handleCalendarOAuthCallbackMock).not.toHaveBeenCalled()
    expect(googleCalendarMocks.exchangeCodeForTokens).not.toHaveBeenCalled()
    expect(googleCalendarMocks.saveCalendarIntegration).not.toHaveBeenCalled()
    expect(googleCalendarMocks.setupCalendarWebhook).not.toHaveBeenCalled()
  })

  it('persists the active organization and sets up the exact saved integration', async () => {
    const tokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      email: 'calendar@example.com',
    }
    mockAuthorizedSession({
      user: { id: 'user-1' },
      session: { activeOrganizationId: 'org-active' },
    })
    googleCalendarMocks.exchangeCodeForTokens.mockResolvedValue(tokens)

    await callbackHandler({})

    expect(requirePermissionMock).toHaveBeenCalledWith({}, {
      organization: ['update'],
    })
    expect(handleCalendarOAuthCallbackMock).toHaveBeenCalledWith({}, expect.objectContaining({
      extraCookieNames: ['gcal_oauth_org'],
    }))
    expect(googleCalendarMocks.saveCalendarIntegration).toHaveBeenCalledWith(
      'user-1',
      'org-active',
      tokens,
    )
    expect(googleCalendarMocks.setupCalendarWebhook).toHaveBeenCalledWith({
      integrationId: 'integration-exact',
      userId: 'user-1',
      organizationId: 'org-active',
    })
  })

  it('rejects an OAuth callback when the active organization differs from the initiation cookie', async () => {
    mockAuthorizedSession({
      user: { id: 'user-1' },
      session: { activeOrganizationId: 'org-current' },
    })
    handleCalendarOAuthCallbackMock.mockImplementation(async (_event, options) => {
      await options.onSuccess({
        code: 'authorization-code',
        extraCookies: { gcal_oauth_org: 'org-initiated' },
      })
    })

    await expect(callbackHandler({})).rejects.toThrow(
      'Google Calendar organization changed during authorization',
    )

    expect(googleCalendarMocks.exchangeCodeForTokens).not.toHaveBeenCalled()
    expect(googleCalendarMocks.saveCalendarIntegration).not.toHaveBeenCalled()
    expect(googleCalendarMocks.setupCalendarWebhook).not.toHaveBeenCalled()
  })

  it('does no provider work when organization update permission is denied', async () => {
    const forbidden = Object.assign(new Error('Forbidden'), { statusCode: 403 })
    requirePermissionMock.mockRejectedValue(forbidden)
    requireAuthMock.mockResolvedValue({
      user: { id: 'user-1' },
      session: { activeOrganizationId: 'org-active' },
    })

    await expect(callbackHandler({})).rejects.toBe(forbidden)

    expect(handleCalendarOAuthCallbackMock).not.toHaveBeenCalled()
    expect(googleCalendarMocks.exchangeCodeForTokens).not.toHaveBeenCalled()
    expect(googleCalendarMocks.saveCalendarIntegration).not.toHaveBeenCalled()
    expect(googleCalendarMocks.setupCalendarWebhook).not.toHaveBeenCalled()
  })
})
