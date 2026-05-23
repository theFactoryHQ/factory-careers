import { and, eq } from 'drizzle-orm'
import { interview, interviewCalendarEvent } from '../../../database/schema'
import { interviewIdParamSchema } from '../../../utils/schemas/interview'
import {
  cancelConnectedCalendarEvent,
  cancelConnectedCalendarEventRecords,
  type CalendarEventRecord,
  type CalendarProvider,
} from '../../../utils/calendar'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['delete'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, interviewIdParamSchema.parse)

  const current = await db.query.interview.findFirst({
    where: and(eq(interview.id, id), eq(interview.organizationId, orgId)),
    columns: { id: true, calendarEventProvider: true, googleCalendarEventId: true, createdById: true },
  })

  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Interview not found' })
  }

  const syncedCalendarEvents = await db.query.interviewCalendarEvent.findMany({
    where: and(eq(interviewCalendarEvent.interviewId, id), eq(interviewCalendarEvent.organizationId, orgId)),
  })

  // Cancel calendar event (non-blocking)
  if (current.googleCalendarEventId || syncedCalendarEvents.length > 0) {
    const provider = (current.calendarEventProvider ?? 'google') as CalendarProvider
    const eventRecords: CalendarEventRecord[] = syncedCalendarEvents
      .filter(record => record.eventId)
      .map(record => ({
        id: record.id,
        provider: record.provider as CalendarProvider,
        destinationEmail: record.destinationEmail,
        eventId: record.eventId,
        isPrimary: record.isPrimary,
      }))

    if (eventRecords.length > 0) {
      cancelConnectedCalendarEventRecords(current.createdById, orgId, eventRecords).catch(err => {
        logError('calendar.cancel_event_on_delete_failed', {
          provider,
          error_message: err instanceof Error ? err.message : String(err),
        })
      })
    }
    else if (current.googleCalendarEventId) {
      cancelConnectedCalendarEvent(current.createdById, orgId, current.googleCalendarEventId, provider).catch(err => {
        logError('calendar.cancel_event_on_delete_failed', {
          event_id: current.googleCalendarEventId,
          provider,
          error_message: err instanceof Error ? err.message : String(err),
        })
      })
    }
  }

  await db.delete(interview).where(
    and(eq(interview.id, id), eq(interview.organizationId, orgId)),
  )

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'interview',
    resourceId: id,
  })

  setResponseStatus(event, 204)
  return null
})
