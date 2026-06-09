import { and, eq } from 'drizzle-orm'
import { interview, interviewCalendarEvent, application, candidate, job, organization } from '../../database/schema'
import { createInterviewSchema } from '../../utils/schemas/interview'
import { createConnectedCalendarEvents } from '../../utils/calendar'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['create'] })
  const orgId = session.session.activeOrganizationId

  const body = await readValidatedBody(event, createInterviewSchema.parse)

  // Default interviewers to the person creating the interview if none provided
  let interviewers = body.interviewers ?? []
  if (interviewers.length === 0 && session.user?.email) {
    interviewers = [session.user.email]
  }

  // Verify the application exists and belongs to this org
  const app = await db.query.application.findFirst({
    where: and(
      eq(application.id, body.applicationId),
      eq(application.organizationId, orgId),
    ),
    with: {
      candidate: { columns: { email: true, firstName: true, lastName: true } },
      job: { columns: { title: true } },
    },
  })

  if (!app) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Application not found',
    })
  }

  const [created] = await db.insert(interview).values({
    organizationId: orgId,
    applicationId: body.applicationId,
    title: body.title,
    type: body.type,
    scheduledAt: new Date(body.scheduledAt),
    duration: body.duration,
    location: body.location ?? null,
    notes: body.notes ?? null,
    interviewers,
    timezone: body.timezone ?? 'UTC',
    createdById: session.user.id,
  }).returning()

  if (!created) throw createError({ statusCode: 500, statusMessage: 'Failed to create interview' })

  // Sync to the connected calendar provider only when explicitly requested
  let calendarEventLink: string | null = null
  let calendarEventId: string | null = null
  let calendarEventProvider: 'google' | 'microsoft' | null = null

  if (body.calendarSync !== false && app.candidate && app.job) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, orgId),
      columns: { name: true },
    })

    const candidateName = `${app.candidate.firstName} ${app.candidate.lastName}`
    const calendarTitle = body.calendarEventTitle?.trim() || body.title
    const calendarDescription = body.calendarEventDescription?.trim() || [
      `Interview: ${body.title}`,
      `Position: ${app.job.title}`,
      `Candidate: ${candidateName}`,
      `Duration: ${body.duration} minutes`,
      ...(body.location ? [`Location: ${body.location}`] : []),
      ...(body.notes ? [`\nNotes: ${body.notes}`] : []),
      '',
      `Scheduled via ${org?.name || 'Factory Careers'}`,
    ].join('\n')
    const addCandidate = body.calendarAddCandidateAttendee !== false
    const sendUpdates = body.calendarSendUpdates !== false
    const generateTeamsLink = body.generateTeamsLink !== false

    try {
      const results = await createConnectedCalendarEvents(session.user.id, orgId, {
        title: calendarTitle,
        description: calendarDescription,
        startTime: new Date(body.scheduledAt),
        durationMinutes: body.duration,
        timezone: body.timezone ?? 'UTC',
        location: body.location ?? null,
        candidateEmail: addCandidate ? app.candidate.email : null,
        candidateName,
        interviewerEmails: interviewers,
        sendUpdates,
        generateTeamsLink,
      })

      if (results.length > 0) {
        await db.insert(interviewCalendarEvent).values(results.map(result => ({
          organizationId: orgId,
          interviewId: created.id,
          provider: result.provider,
          destinationType: result.destinationType,
          destinationEmail: result.destinationEmail,
          eventId: result.id,
          eventLink: result.htmlLink,
          isPrimary: result.isPrimary,
          syncStatus: result.success ? 'synced' : 'failed',
          lastError: result.error ?? null,
        })))
      }

      const primaryResult = results.find(result => result.success && result.isPrimary && result.id && result.htmlLink)
        ?? results.find(result => result.success && result.id && result.htmlLink)

      if (primaryResult?.id && primaryResult.htmlLink) {
        calendarEventId = primaryResult.id
        calendarEventLink = primaryResult.htmlLink
        calendarEventProvider = primaryResult.provider
        await db.update(interview)
          .set({
            calendarEventProvider: primaryResult.provider,
            googleCalendarEventId: primaryResult.id,
            googleCalendarEventLink: primaryResult.htmlLink,
          })
          .where(eq(interview.id, created.id))
      }
    } catch (err) {
      logError('interview.calendar_sync_failed', {
        posthog_distinct_id: session.user.id,
        org_id: orgId,
        interview_id: created.id,
        error_message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'created',
    resourceType: 'interview',
    resourceId: created.id,
    metadata: {
      applicationId: body.applicationId,
      title: body.title,
      scheduledAt: body.scheduledAt,
    },
  })

  trackEvent(event, session, 'interview scheduled', {
    interview_id: created.id,
    application_id: body.applicationId,
    interview_type: body.type,
    duration_minutes: body.duration,
    has_calendar_sync: !!calendarEventId,
  })

  logApiRequest(event, session, 'interview.scheduled', {
    interview_id: created.id,
    application_id: body.applicationId,
    interview_type: body.type,
    duration_minutes: body.duration,
    has_calendar_sync: !!calendarEventId,
  })

  await invalidateOrgScopedDashboardCache(event)

  setResponseStatus(event, 201)
  return {
    ...created,
    ...(calendarEventId && { googleCalendarEventId: calendarEventId }),
    ...(calendarEventLink && { googleCalendarEventLink: calendarEventLink }),
    ...(calendarEventProvider && { calendarEventProvider }),
  }
})
