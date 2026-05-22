/**
 * GET /api/calendar/microsoft/callback
 *
 * Handles the OAuth2 callback from Microsoft after the user grants calendar
 * access. Validates CSRF state, exchanges the code, stores encrypted tokens,
 * and redirects back to integrations settings.
 */
import { timingSafeEqual } from 'node:crypto'
import {
  exchangeMicrosoftCodeForTokens,
  saveMicrosoftCalendarIntegration,
} from '../../../utils/microsoft-calendar'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const activeOrgId = session.session.activeOrganizationId

  const query = getQuery(event)
  const code = query.code as string | undefined
  const state = query.state as string | undefined
  const error = query.error as string | undefined

  if (error) {
    return sendRedirect(event, '/dashboard/settings/integrations?error=consent_denied&provider=microsoft')
  }

  if (!code || !state) {
    throw createError({ statusCode: 400, statusMessage: 'Missing authorization code or state' })
  }

  const storedState = getCookie(event, 'mscal_oauth_state')
  const storedOrgId = getCookie(event, 'mscal_oauth_org')
  deleteCookie(event, 'mscal_oauth_state', { path: '/api/calendar/microsoft/callback' })
  deleteCookie(event, 'mscal_oauth_org', { path: '/api/calendar/microsoft/callback' })

  if (!storedState || storedState.length !== state.length) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid OAuth state — possible CSRF attack' })
  }

  const stateMatch = timingSafeEqual(
    Buffer.from(storedState, 'utf-8'),
    Buffer.from(state, 'utf-8'),
  )

  if (!stateMatch) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid OAuth state — possible CSRF attack' })
  }

  try {
    const orgId = storedOrgId || activeOrgId
    if (!orgId) {
      throw new Error('Missing active organization for Microsoft Calendar connection')
    }

    const tokens = await exchangeMicrosoftCodeForTokens(code)
    await saveMicrosoftCalendarIntegration(session.user.id, orgId, tokens)

    return sendRedirect(event, '/dashboard/settings/integrations?success=connected&provider=microsoft')
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logError('calendar.microsoft_oauth_callback_failed', {
      posthog_distinct_id: session.user.id,
      error_message: message,
    })
    if (message.startsWith('Microsoft Calendar group')) {
      return sendRedirect(event, '/dashboard/settings/integrations?error=calendar_not_accessible&provider=microsoft')
    }
    return sendRedirect(event, '/dashboard/settings/integrations?error=oauth_failed&provider=microsoft')
  }
})
