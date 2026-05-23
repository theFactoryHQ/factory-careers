/**
 * GET /api/calendar/status
 *
 * Returns the current user's calendar integration status.
 * Never exposes raw tokens — only connection metadata.
 */
import { getConnectedCalendarIntegration, getPreferredCalendarProvider, isCalendarConfigured } from '../../utils/calendar'
import {
  getMicrosoftCalendarAccountEmail,
  getMicrosoftCalendarDestinationSummary,
  isMicrosoftCalendarApplicationMode,
} from '../../utils/microsoft-calendar'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const orgId = session.session.activeOrganizationId

  const preferredProvider = getPreferredCalendarProvider()
  const expectedAccountEmail = getMicrosoftCalendarAccountEmail()
  const isMicrosoftApplicationMode = preferredProvider === 'microsoft' && isMicrosoftCalendarApplicationMode()
  const microsoftDestinationSummary = isMicrosoftApplicationMode
    ? await getMicrosoftCalendarDestinationSummary(orgId)
    : null

  if (!isCalendarConfigured()) {
    return {
      available: false,
      availableProvider: null,
      authMode: null,
      managedByAdmin: false,
      expectedAccountEmail,
      destinations: [],
      syncInterviewers: false,
      connectionScope: null,
      connected: false,
      provider: null,
      providerLabel: null,
      accountEmail: null,
      calendarId: null,
      webhookActive: false,
    }
  }

  if (isMicrosoftApplicationMode) {
    const primaryDestination = microsoftDestinationSummary.destinations.find(destination => destination.isPrimary)
      ?? microsoftDestinationSummary.destinations[0]

    return {
      available: true,
      availableProvider: preferredProvider,
      authMode: 'application',
      managedByAdmin: true,
      expectedAccountEmail,
      destinations: microsoftDestinationSummary.destinations,
      syncInterviewers: microsoftDestinationSummary.syncInterviewers,
      connectionScope: 'organization',
      connected: true,
      provider: 'microsoft',
      providerLabel: 'Microsoft Calendar',
      accountEmail: 'Microsoft app credentials',
      calendarId: primaryDestination?.email ?? expectedAccountEmail,
      webhookActive: false,
    }
  }

  const integration = await getConnectedCalendarIntegration(session.user.id, orgId)

  if (!integration) {
    return {
      available: true,
      availableProvider: preferredProvider,
      authMode: preferredProvider === 'microsoft' ? 'delegated' : null,
      managedByAdmin: false,
      expectedAccountEmail,
      destinations: [],
      syncInterviewers: false,
      connectionScope: null,
      connected: false,
      provider: null,
      providerLabel: preferredProvider === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar',
      accountEmail: null,
      calendarId: null,
      webhookActive: false,
    }
  }

  const webhookActive = !!(
    integration.webhookChannelId
    && integration.webhookExpiration
    && new Date(integration.webhookExpiration) > new Date()
  )

  return {
    available: true,
    availableProvider: preferredProvider,
    authMode: integration.provider === 'microsoft' ? 'delegated' : null,
    managedByAdmin: false,
    expectedAccountEmail,
    destinations: [],
    syncInterviewers: false,
    connectionScope: integration.organizationId ? 'organization' : 'user',
    connected: true,
    provider: integration.provider,
    providerLabel: integration.provider === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar',
    accountEmail: integration.accountEmail,
    calendarId: integration.calendarId,
    webhookActive: integration.provider === 'google' ? webhookActive : false,
    connectedAt: integration.createdAt,
  }
})
