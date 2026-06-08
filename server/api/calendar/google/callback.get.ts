/**
 * GET /api/calendar/google/callback
 *
 * Handles the OAuth2 callback from Google after the user grants consent.
 * Validates the CSRF state token, exchanges the code for tokens,
 * encrypts and stores them, sets up the webhook, then redirects to settings.
 */
import { exchangeCodeForTokens, saveCalendarIntegration, setupCalendarWebhook } from '../../../utils/google-calendar'
import { handleCalendarOAuthCallback } from '../../../utils/calendarOAuth'

const GOOGLE_CALLBACK_PATH = '/api/calendar/google/callback'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)

  return handleCalendarOAuthCallback(event, {
    stateCookieName: 'gcal_oauth_state',
    callbackPath: GOOGLE_CALLBACK_PATH,
    consentDeniedRedirect: '/dashboard/settings/integrations?error=consent_denied',
    successRedirect: '/dashboard/settings/integrations?success=connected',
    oauthFailedRedirect: '/dashboard/settings/integrations?error=oauth_failed',
    logFailureEvent: 'calendar.oauth_callback_failed',
    onSuccess: async ({ code }) => {
      const tokens = await exchangeCodeForTokens(code)
      await saveCalendarIntegration(session.user.id, tokens)

      setupCalendarWebhook(session.user.id).catch((err) => {
        logWarn('calendar.webhook_setup_failed', {
          posthog_distinct_id: session.user.id,
          error_message: err instanceof Error ? err.message : String(err),
        })
      })
    },
  })
})