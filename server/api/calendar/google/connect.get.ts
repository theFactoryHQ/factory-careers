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
  await requireAuth(event)

  if (!isGoogleCalendarConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Google Calendar integration is not configured',
    })
  }

  return initiateCalendarOAuth(event, {
    stateCookieName: 'gcal_oauth_state',
    callbackPath: GOOGLE_CALLBACK_PATH,
    getAuthUrl: getGoogleAuthUrl,
  })
})