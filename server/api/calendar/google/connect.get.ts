/**
 * GET /api/calendar/google/connect
 *
 * Initiates the Google OAuth2 flow by redirecting the user to Google's consent screen.
 * Generates a CSRF state token stored in a secure, httpOnly cookie.
 */
import { getGoogleAuthUrl, isGoogleCalendarConfigured } from '../../../utils/google-calendar'
import { initiateCalendarOAuth } from '../../../utils/calendarOAuth'

const GOOGLE_CALLBACK_PATH = '/api/calendar/google/callback'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId

  if (!orgId) {
    throw createError({ statusCode: 403, statusMessage: 'No active organization' })
  }

  if (!isGoogleCalendarConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Google Calendar integration is not configured',
    })
  }

  return initiateCalendarOAuth(event, {
    stateCookieName: 'gcal_oauth_state',
    callbackPath: GOOGLE_CALLBACK_PATH,
    extraCookies: [{ name: 'gcal_oauth_org', value: orgId }],
    getAuthUrl: getGoogleAuthUrl,
  })
})
