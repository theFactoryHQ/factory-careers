import { and, eq } from 'drizzle-orm'
import { calendarIntegration } from '../database/schema'
import {
  createCalendarEvent as createGoogleCalendarEvent,
  updateCalendarEvent as updateGoogleCalendarEvent,
  cancelCalendarEvent as cancelGoogleCalendarEvent,
  removeCalendarIntegration as removeGoogleCalendarIntegration,
  setupCalendarWebhook as setupGoogleCalendarWebhook,
  isGoogleCalendarConfigured,
  type GoogleCalendarIntegrationIdentity,
  type GoogleCalendarIntegrationSnapshot,
} from './google-calendar'
import {
  createMicrosoftCalendarEvents,
  updateMicrosoftCalendarEvent,
  cancelMicrosoftCalendarEvent,
  updateMicrosoftMailboxCalendarEvent,
  cancelMicrosoftMailboxCalendarEvent,
  removeMicrosoftCalendarIntegration,
  isMicrosoftCalendarConfigured,
  isMicrosoftCalendarApplicationMode,
  type MicrosoftCalendarSyncResult,
  type MicrosoftCalendarIntegrationIdentity,
} from './microsoft-calendar'

export type CalendarProvider = 'google' | 'microsoft'

export interface InterviewEventData {
  title: string
  description: string
  startTime: Date
  durationMinutes: number
  timezone: string
  location: string | null
  candidateEmail: string | null
  candidateName: string
  interviewerEmails: string[]
  sendUpdates?: boolean
  generateTeamsLink?: boolean
}

export type CalendarEventSyncResult = MicrosoftCalendarSyncResult & {
  provider: CalendarProvider
}

export interface CalendarEventRecord {
  id: string
  provider: CalendarProvider
  destinationEmail: string | null
  eventId: string | null
  isPrimary: boolean
}

function googleIntegrationIdentity(
  integration: { id: string, userId: string | null, organizationId: string | null },
  fallbackUserId: string,
): GoogleCalendarIntegrationIdentity {
  return {
    integrationId: integration.id,
    userId: integration.userId ?? fallbackUserId,
    organizationId: integration.organizationId,
  }
}

export function getPreferredCalendarProvider(): CalendarProvider | null {
  if (isMicrosoftCalendarConfigured()) return 'microsoft'
  if (isGoogleCalendarConfigured()) return 'google'
  return null
}

export function isCalendarConfigured(): boolean {
  return !!getPreferredCalendarProvider()
}

export function isCalendarProviderConfigured(provider: CalendarProvider): boolean {
  return provider === 'microsoft'
    ? isMicrosoftCalendarConfigured()
    : isGoogleCalendarConfigured()
}

export async function getConnectedCalendarIntegration(userId: string, organizationId?: string | null) {
  if (organizationId) {
    const microsoft = await db.query.calendarIntegration.findFirst({
      where: and(eq(calendarIntegration.organizationId, organizationId), eq(calendarIntegration.provider, 'microsoft')),
    })
    if (microsoft) return microsoft

    return await db.query.calendarIntegration.findFirst({
      where: and(eq(calendarIntegration.organizationId, organizationId), eq(calendarIntegration.provider, 'google')),
    }) ?? null
  }

  const userMicrosoft = await db.query.calendarIntegration.findFirst({
    where: and(eq(calendarIntegration.userId, userId), eq(calendarIntegration.provider, 'microsoft')),
  })
  if (userMicrosoft) return userMicrosoft

  return await db.query.calendarIntegration.findFirst({
    where: and(eq(calendarIntegration.userId, userId), eq(calendarIntegration.provider, 'google')),
  })
}

async function resolveCalendarIntegration(userId: string, organizationId?: string | null, provider?: CalendarProvider | null) {
  if (!provider) return await getConnectedCalendarIntegration(userId, organizationId)

  if (organizationId) {
    return await db.query.calendarIntegration.findFirst({
      where: and(eq(calendarIntegration.organizationId, organizationId), eq(calendarIntegration.provider, provider)),
    }) ?? null
  }

  return await db.query.calendarIntegration.findFirst({
    where: and(eq(calendarIntegration.userId, userId), eq(calendarIntegration.provider, provider)),
  })
}

export async function createConnectedCalendarEvent(
  userId: string,
  organizationId: string | null | undefined,
  data: InterviewEventData,
): Promise<{ id: string; htmlLink: string; provider: CalendarProvider } | null> {
  const results = await createConnectedCalendarEvents(userId, organizationId, data)
  const primary = results.find(result => result.success && result.isPrimary && result.id && result.htmlLink)
    ?? results.find(result => result.success && result.id && result.htmlLink)

  return primary?.id && primary.htmlLink
    ? { id: primary.id, htmlLink: primary.htmlLink, provider: primary.provider }
    : null
}

export async function createConnectedCalendarEvents(
  userId: string,
  organizationId: string | null | undefined,
  data: InterviewEventData,
): Promise<CalendarEventSyncResult[]> {
  if (isMicrosoftCalendarConfigured() && isMicrosoftCalendarApplicationMode()) {
    const results = await createMicrosoftCalendarEvents(userId, organizationId, data)
    return results.map(result => ({ ...result, provider: 'microsoft' }))
  }

  const integration = await resolveCalendarIntegration(userId, organizationId)
  if (integration?.provider === 'microsoft') {
    const results = await createMicrosoftCalendarEvents(integration.userId ?? userId, integration.organizationId, data)
    return results.map(result => ({ ...result, provider: 'microsoft' }))
  }
  if (integration?.provider === 'google') {
    const result = await createGoogleCalendarEvent(
      googleIntegrationIdentity(integration, userId),
      data,
    )
    return result
      ? [{
          provider: 'google',
          destinationType: 'connected_calendar',
          destinationEmail: null,
          isPrimary: true,
          success: true,
          id: result.id,
          htmlLink: result.htmlLink,
        }]
      : []
  }
  return []
}

export async function updateConnectedCalendarEvent(
  userId: string,
  organizationId: string | null | undefined,
  eventId: string,
  data: Partial<InterviewEventData>,
  provider?: CalendarProvider | null,
): Promise<string | null> {
  const integration = await resolveCalendarIntegration(userId, organizationId, provider)
  if (integration?.provider === 'microsoft') return await updateMicrosoftCalendarEvent(integration.userId ?? userId, integration.organizationId, eventId, data)
  if (integration?.provider === 'google') {
    return await updateGoogleCalendarEvent(
      googleIntegrationIdentity(integration, userId),
      eventId,
      data,
    )
  }
  return null
}

export async function cancelConnectedCalendarEvent(
  userId: string,
  organizationId: string | null | undefined,
  eventId: string,
  provider?: CalendarProvider | null,
): Promise<boolean> {
  const integration = await resolveCalendarIntegration(userId, organizationId, provider)
  if (integration?.provider === 'microsoft') return await cancelMicrosoftCalendarEvent(integration.userId ?? userId, integration.organizationId, eventId)
  if (integration?.provider === 'google') {
    return await cancelGoogleCalendarEvent(
      googleIntegrationIdentity(integration, userId),
      eventId,
    )
  }
  return false
}

export async function updateConnectedCalendarEventRecords(
  userId: string,
  organizationId: string | null | undefined,
  eventRecords: CalendarEventRecord[],
  data: Partial<InterviewEventData>,
): Promise<Array<{ recordId: string; htmlLink: string | null; success: boolean }>> {
  return await Promise.all(eventRecords.map(async (record) => {
    if (!record.eventId) return { recordId: record.id, htmlLink: null, success: false }

    if (
      record.provider === 'microsoft'
      && isMicrosoftCalendarApplicationMode()
      && record.destinationEmail
    ) {
      const htmlLink = await updateMicrosoftMailboxCalendarEvent(
        userId,
        record.destinationEmail,
        record.eventId,
        record.isPrimary,
        data,
      )
      return { recordId: record.id, htmlLink, success: !!htmlLink }
    }

    const htmlLink = await updateConnectedCalendarEvent(userId, organizationId, record.eventId, data, record.provider)
    return { recordId: record.id, htmlLink, success: !!htmlLink }
  }))
}

export async function cancelConnectedCalendarEventRecords(
  userId: string,
  organizationId: string | null | undefined,
  eventRecords: CalendarEventRecord[],
): Promise<Array<{ recordId: string; success: boolean }>> {
  return await Promise.all(eventRecords.map(async (record) => {
    if (!record.eventId) return { recordId: record.id, success: false }

    if (
      record.provider === 'microsoft'
      && isMicrosoftCalendarApplicationMode()
      && record.destinationEmail
    ) {
      const success = await cancelMicrosoftMailboxCalendarEvent(
        userId,
        record.destinationEmail,
        record.eventId,
      )
      return { recordId: record.id, success }
    }

    const success = await cancelConnectedCalendarEvent(userId, organizationId, record.eventId, record.provider)
    return { recordId: record.id, success }
  }))
}

export async function removeConnectedCalendarIntegration(userId: string, organizationId?: string | null): Promise<void> {
  const integration = await getConnectedCalendarIntegration(userId, organizationId)
  if (!integration) return

  if (integration.provider === 'microsoft') {
    const identity: MicrosoftCalendarIntegrationIdentity = {
      integrationId: integration.id,
      userId: integration.userId,
      organizationId: integration.organizationId,
      connectionGeneration: integration.connectionGeneration,
    }
    const removed = await removeMicrosoftCalendarIntegration(identity)
    if (!removed) throw createError({ statusCode: 409, statusMessage: 'Calendar connection changed; retry disconnect' })
    return
  }

  const googleUserId = integration.userId ?? userId
  const snapshot: GoogleCalendarIntegrationSnapshot = {
    integrationId: integration.id,
    userId: googleUserId,
    organizationId: integration.organizationId,
    connectionGeneration: integration.connectionGeneration,
  }
  const removed = await removeGoogleCalendarIntegration(snapshot)
  if (!removed) throw createError({ statusCode: 409, statusMessage: 'Calendar connection changed; retry disconnect' })
}

export async function setupConnectedCalendarWebhook(userId: string, organizationId?: string | null, provider?: CalendarProvider | null): Promise<boolean> {
  const integration = await resolveCalendarIntegration(userId, organizationId, provider)
  if (integration?.provider === 'google') {
    return await setupGoogleCalendarWebhook({
      integrationId: integration.id,
      userId: integration.userId ?? userId,
      organizationId: integration.organizationId,
    })
  }

  // Microsoft Graph event creation/update/delete works without a webhook.
  // RSVP/back-sync via Graph change subscriptions can be added later without
  // affecting the event sync path.
  return false
}
