/**
 * POST /api/calendar/disconnect
 *
 * Disconnects the user's calendar integration.
 * Stops any provider webhook channel and deletes encrypted credentials.
 */
import { isCalendarConfigured, removeConnectedCalendarIntegration } from '../../utils/calendar'
import { isMicrosoftCalendarApplicationMode } from '../../utils/microsoft-calendar'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId

  if (!isCalendarConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Calendar integration is not configured' })
  }

  if (isMicrosoftCalendarApplicationMode()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Microsoft Calendar is managed by server configuration',
    })
  }

  await removeConnectedCalendarIntegration(session.user.id, orgId)

  return { success: true }
})
