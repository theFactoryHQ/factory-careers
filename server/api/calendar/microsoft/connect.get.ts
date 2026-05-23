/**
 * GET /api/calendar/microsoft/connect
 *
 * Initiates the Microsoft OAuth2 flow for delegated Microsoft Graph calendar
 * access. Generates a CSRF state token stored in a secure, httpOnly cookie.
 */
import { randomBytes } from 'node:crypto'
import {
  enableMicrosoftCalendarAppIntegration,
  getMicrosoftAuthUrl,
  isMicrosoftCalendarApplicationMode,
  isMicrosoftCalendarConfigured,
} from '../../../utils/microsoft-calendar'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
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

  // In application (app-only) mode, we don't do per-user OAuth.
  // Just enable the org-level integration using the pre-configured app credentials.
  if (isMicrosoftCalendarApplicationMode()) {
    await enableMicrosoftCalendarAppIntegration(orgId)
    return sendRedirect(event, '/dashboard/settings/integrations?success=connected&provider=microsoft')
  }

  const stateToken = randomBytes(32).toString('hex')

  setCookie(event, 'mscal_oauth_state', stateToken, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    maxAge: 300,
    path: '/api/calendar/microsoft/callback',
  })

  setCookie(event, 'mscal_oauth_org', orgId, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    maxAge: 300,
    path: '/api/calendar/microsoft/callback',
  })

  return sendRedirect(event, getMicrosoftAuthUrl(stateToken, session.user.email))
})
