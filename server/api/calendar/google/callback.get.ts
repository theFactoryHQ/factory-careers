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
  const session = await requirePermission(event, { organization: ['update'] })
  const activeOrgId = session.session.activeOrganizationId

  if (!activeOrgId) {
    throw createError({ statusCode: 403, statusMessage: 'No active organization' })
  }

  return handleCalendarOAuthCallback(event, {
    stateCookieName: 'gcal_oauth_state',
    callbackPath: GOOGLE_CALLBACK_PATH,
    extraCookieNames: ['gcal_oauth_org'],
    consentDeniedRedirect: '/dashboard/settings/integrations?error=consent_denied',
    successRedirect: '/dashboard/settings/integrations?success=connected',
    oauthFailedRedirect: '/dashboard/settings/integrations?error=oauth_failed',
    logFailureEvent: 'calendar.oauth_callback_failed',
    onSuccess: async ({ code, extraCookies }) => {
      if (extraCookies.gcal_oauth_org !== activeOrgId) {
        throw new Error('Google Calendar organization changed during authorization')
      }

      const tokens = await exchangeCodeForTokens(code)
      const integration = await saveCalendarIntegration(session.user.id, activeOrgId, tokens)

      setupCalendarWebhook(integration).catch((err) => {
        logWarn('calendar.webhook_setup_failed', {
          posthog_distinct_id: session.user.id,
          error_message: err instanceof Error ? err.message : String(err),
        })
      })
    },
  })
})
