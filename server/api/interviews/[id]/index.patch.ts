import { and, eq } from 'drizzle-orm'
import { interview, interviewCalendarEvent } from '../../../database/schema'
import { interviewIdParamSchema, updateInterviewSchema } from '../../../utils/schemas/interview'
import { INTERVIEW_STATUS_TRANSITIONS } from '~~/shared/status-transitions'
import {
  updateConnectedCalendarEvent,
  cancelConnectedCalendarEvent,
  updateConnectedCalendarEventRecords,
  cancelConnectedCalendarEventRecords,
  type CalendarEventRecord,
  type CalendarProvider,
} from '../../../utils/calendar'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, interviewIdParamSchema.parse)
  const body = await readValidatedBody(event, updateInterviewSchema.parse)

  // Fetch current interview for validation
  const current = await db.query.interview.findFirst({
    where: and(eq(interview.id, id), eq(interview.organizationId, orgId)),
    columns: { id: true, status: true, calendarEventProvider: true, googleCalendarEventId: true, createdById: true, timezone: true },
  })

  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Interview not found' })
  }

  const syncedCalendarEvents = await db.query.interviewCalendarEvent.findMany({
    where: and(eq(interviewCalendarEvent.interviewId, id), eq(interviewCalendarEvent.organizationId, orgId)),
  })

  // Validate status transition
  if (body.status && body.status !== current.status) {
    const allowed = INTERVIEW_STATUS_TRANSITIONS[current.status] ?? []
    if (!allowed.includes(body.status)) {
      throw createError({
        statusCode: 422,
        statusMessage: `Cannot transition from "${current.status}" to "${body.status}"`,
      })
    }
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (body.title !== undefined) updateData.title = body.title
  if (body.type !== undefined) updateData.type = body.type
  if (body.status !== undefined) updateData.status = body.status
  if (body.scheduledAt !== undefined) updateData.scheduledAt = new Date(body.scheduledAt)
  if (body.duration !== undefined) updateData.duration = body.duration
  if (body.location !== undefined) updateData.location = body.location
  if (body.notes !== undefined) updateData.notes = body.notes
  if (body.interviewers !== undefined) updateData.interviewers = body.interviewers
  if (body.timezone !== undefined) updateData.timezone = body.timezone

  const [updated] = await db
    .update(interview)
    .set(updateData)
    .where(and(eq(interview.id, id), eq(interview.organizationId, orgId)))
    .returning()

  // Sync changes to the connected calendar provider (non-blocking)
  if (current.googleCalendarEventId || syncedCalendarEvents.length > 0) {
    const isCancelling = body.status === 'cancelled'
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

    if (eventRecords.length > 0 && isCancelling) {
      cancelConnectedCalendarEventRecords(current.createdById, orgId, eventRecords).then(async (results) => {
        await Promise.all(results.map(result => db.update(interviewCalendarEvent)
          .set({
            syncStatus: result.success ? 'cancelled' : 'failed',
            updatedAt: new Date(),
          })
          .where(eq(interviewCalendarEvent.id, result.recordId))))
      }).catch(err => {
        logError('calendar.cancel_event_failed', {
          provider,
          error_message: err instanceof Error ? err.message : String(err),
        })
      })
    }
    else if (isCancelling && current.googleCalendarEventId) {
      cancelConnectedCalendarEvent(current.createdById, orgId, current.googleCalendarEventId, provider).catch(err => {
        logError('calendar.cancel_event_failed', {
          event_id: current.googleCalendarEventId,
          provider,
          error_message: err instanceof Error ? err.message : String(err),
        })
      })
    }
    else {
      // Fetch candidate info for attendee update
      const interviewWithApp = await db.query.interview.findFirst({
        where: eq(interview.id, id),
        with: {
          application: {
            with: {
              candidate: { columns: { email: true, firstName: true, lastName: true } },
            },
          },
        },
      })

      const candidate = interviewWithApp?.application?.candidate
      const calendarUpdateData = {
        ...(body.title ? { title: body.title } : {}),
        ...(body.scheduledAt ? {
          startTime: new Date(body.scheduledAt),
          durationMinutes: body.duration ?? updated?.duration ?? 60,
          timezone: body.timezone ?? current.timezone ?? 'UTC',
        } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(candidate ? {
          candidateEmail: candidate.email,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
        } : {}),
        ...(body.interviewers ? { interviewerEmails: body.interviewers } : {}),
      }

      if (eventRecords.length > 0) {
        updateConnectedCalendarEventRecords(current.createdById, orgId, eventRecords, calendarUpdateData).then(async (results) => {
          await Promise.all(results.map(result => db.update(interviewCalendarEvent)
            .set({
              ...(result.htmlLink ? { eventLink: result.htmlLink } : {}),
              syncStatus: result.success ? 'synced' : 'failed',
              updatedAt: new Date(),
            })
            .where(eq(interviewCalendarEvent.id, result.recordId))))

          const primaryRecord = eventRecords.find(record => record.isPrimary) ?? eventRecords[0]
          const primaryResult = primaryRecord
            ? results.find(result => result.recordId === primaryRecord.id)
            : null
          if (primaryResult?.htmlLink) {
            await db.update(interview)
              .set({ googleCalendarEventLink: primaryResult.htmlLink })
              .where(and(eq(interview.id, id), eq(interview.organizationId, orgId)))
          }
        }).catch(err => {
          logError('calendar.update_event_failed', {
            provider,
            error_message: err instanceof Error ? err.message : String(err),
          })
        })
      }
      else if (current.googleCalendarEventId) {
        updateConnectedCalendarEvent(current.createdById, orgId, current.googleCalendarEventId, calendarUpdateData, provider).then(async (htmlLink) => {
          if (htmlLink) {
            await db.update(interview)
              .set({ googleCalendarEventLink: htmlLink })
              .where(and(eq(interview.id, id), eq(interview.organizationId, orgId)))
          }
        }).catch(err => {
          logError('calendar.update_event_failed', {
            event_id: current.googleCalendarEventId,
            provider,
            error_message: err instanceof Error ? err.message : String(err),
          })
        })
      }
    }
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: body.status && body.status !== current.status ? 'status_changed' : 'updated',
    resourceType: 'interview',
    resourceId: id,
    metadata: {
      ...(body.status && body.status !== current.status
        ? { from: current.status, to: body.status }
        : {}),
    },
  })

  return updated
})
