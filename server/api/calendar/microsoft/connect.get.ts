/**
 * GET /api/calendar/microsoft/connect
 *
 * Initiates the Microsoft OAuth2 flow for delegated Microsoft Graph calendar
 * access. Generates a CSRF state token stored in a secure, httpOnly cookie.
 */
import {
  getMicrosoftAuthUrl,
  isMicrosoftCalendarApplicationMode,
  isMicrosoftCalendarConfigured,
} from '../../../utils/microsoft-calendar'
import { initiateCalendarOAuth } from '../../../utils/calendarOAuth'

const MICROSOFT_CALLBACK_PATH = '/api/calendar/microsoft/callback'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId

  if (!isMicrosoftCalendarConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Microsoft Calendar integration is not configured',
    })
  }

  if (!orgId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Select an organization before connecting Microsoft Calendar',
    })
  }

  if (isMicrosoftCalendarApplicationMode()) {
    // Application credentials are authoritative server configuration. This
    // safe GET must never mutate organization integration state.
    return sendRedirect(event, '/dashboard/settings/integrations?success=connected&provider=microsoft')
  }

  return initiateCalendarOAuth(event, {
    stateCookieName: 'mscal_oauth_state',
    callbackPath: MICROSOFT_CALLBACK_PATH,
    extraCookies: [{ name: 'mscal_oauth_org', value: orgId }],
    getAuthUrl: (stateToken) => getMicrosoftAuthUrl(stateToken, session.user.email),
  })
})
