/**
 * GET /api/calendar/microsoft/callback
 *
 * Handles the OAuth2 callback from Microsoft after the user grants calendar
 * access. Validates CSRF state, exchanges the code, stores encrypted tokens,
 * and redirects back to integrations settings.
 */
import {
  exchangeMicrosoftCodeForTokens,
  saveMicrosoftCalendarIntegration,
} from '../../../utils/microsoft-calendar'
import { handleCalendarOAuthCallback } from '../../../utils/calendarOAuth'

const MICROSOFT_CALLBACK_PATH = '/api/calendar/microsoft/callback'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const activeOrgId = session.session.activeOrganizationId

  return handleCalendarOAuthCallback(event, {
    stateCookieName: 'mscal_oauth_state',
    callbackPath: MICROSOFT_CALLBACK_PATH,
    extraCookieNames: ['mscal_oauth_org'],
    consentDeniedRedirect: '/dashboard/settings/integrations?error=consent_denied&provider=microsoft',
    successRedirect: '/dashboard/settings/integrations?success=connected&provider=microsoft',
    oauthFailedRedirect: '/dashboard/settings/integrations?error=oauth_failed&provider=microsoft',
    logFailureEvent: 'calendar.microsoft_oauth_callback_failed',
    resolveErrorRedirect: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      if (message.startsWith('Microsoft Calendar group')) {
        return '/dashboard/settings/integrations?error=calendar_not_accessible&provider=microsoft'
      }
      return null
    },
    onSuccess: async ({ code, extraCookies }) => {
      const orgId = extraCookies.mscal_oauth_org || activeOrgId
      if (!orgId) {
        throw new Error('Missing active organization for Microsoft Calendar connection')
      }

      const tokens = await exchangeMicrosoftCodeForTokens(code)
      await saveMicrosoftCalendarIntegration(session.user.id, orgId, tokens)
    },
  })
})
