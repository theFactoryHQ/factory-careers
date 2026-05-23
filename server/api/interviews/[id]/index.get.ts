import { and, eq } from 'drizzle-orm'
import { interview, application, candidate, job, interviewCalendarEvent } from '../../../database/schema'
import { interviewIdParamSchema } from '../../../utils/schemas/interview'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['read'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, interviewIdParamSchema.parse)

  const [data] = await db
    .select({
      id: interview.id,
      title: interview.title,
      type: interview.type,
      status: interview.status,
      scheduledAt: interview.scheduledAt,
      duration: interview.duration,
      location: interview.location,
      notes: interview.notes,
      interviewers: interview.interviewers,
      invitationSentAt: interview.invitationSentAt,
      candidateResponse: interview.candidateResponse,
      candidateRespondedAt: interview.candidateRespondedAt,
      calendarEventProvider: interview.calendarEventProvider,
      googleCalendarEventId: interview.googleCalendarEventId,
      googleCalendarEventLink: interview.googleCalendarEventLink,
      createdById: interview.createdById,
      createdAt: interview.createdAt,
      updatedAt: interview.updatedAt,
      applicationId: interview.applicationId,
      candidateId: candidate.id,
      candidateFirstName: candidate.firstName,
      candidateLastName: candidate.lastName,
      candidateEmail: candidate.email,
      candidatePhone: candidate.phone,
      jobId: application.jobId,
      jobTitle: job.title,
    })
    .from(interview)
    .innerJoin(application, eq(application.id, interview.applicationId))
    .innerJoin(candidate, eq(candidate.id, application.candidateId))
    .innerJoin(job, eq(job.id, application.jobId))
    .where(and(eq(interview.id, id), eq(interview.organizationId, orgId)))

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Interview not found' })
  }

  const calendarEventFilters = [
    eq(interviewCalendarEvent.interviewId, id),
    // Tenant isolation: only return calendar events belonging to the same organization
    // as the interview (prevents cross-org leakage even if interviewId is guessed).
    eq(interviewCalendarEvent.organizationId, orgId),
  ]
  if (data.calendarEventProvider) {
    calendarEventFilters.push(eq(interviewCalendarEvent.provider, data.calendarEventProvider))
  }

  const calendarEvents = await db
    .select({
      id: interviewCalendarEvent.id,
      destinationType: interviewCalendarEvent.destinationType,
      destinationEmail: interviewCalendarEvent.destinationEmail,
      eventId: interviewCalendarEvent.eventId,
      eventLink: interviewCalendarEvent.eventLink,
      isPrimary: interviewCalendarEvent.isPrimary,
      syncStatus: interviewCalendarEvent.syncStatus,
      lastError: interviewCalendarEvent.lastError,
      createdAt: interviewCalendarEvent.createdAt,
    })
    .from(interviewCalendarEvent)
    .where(and(...calendarEventFilters))
    .orderBy(interviewCalendarEvent.isPrimary, interviewCalendarEvent.createdAt)

  return {
    ...data,
    calendarEvents,
  }
})
