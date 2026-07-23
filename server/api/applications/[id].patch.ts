import { eq, and } from 'drizzle-orm'
import { application, candidate, job, organization } from '../../database/schema'
import { applicationIdParamSchema, updateApplicationSchema, APPLICATION_STATUS_TRANSITIONS } from '../../utils/schemas/application'
import {
  enqueueCandidateWorkflowEmail,
  prepareConfiguredCandidateWorkflowEmail,
} from '../../utils/candidateWorkflowEmailQueue'
import { resolveFactoryCareersBaseUrl } from '../../utils/baseUrl'

/**
 * PATCH /api/applications/:id
 * Update application status (with server-side transition validation), notes, and score.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, applicationIdParamSchema.parse)
  const body = await readValidatedBody(event, updateApplicationSchema.parse)

  // Fetch current application to validate status transition
  const current = await db.query.application.findFirst({
    where: and(eq(application.id, id), eq(application.organizationId, orgId)),
    columns: { id: true, status: true },
  })

  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  // Validate status transition if status is being changed
  if (body.status && body.status !== current.status) {
    const allowed = APPLICATION_STATUS_TRANSITIONS[current.status] ?? []
    if (!allowed.includes(body.status)) {
      throw createError({
        statusCode: 422,
        statusMessage: `Cannot transition from "${current.status}" to "${body.status}". Allowed: ${allowed.join(', ') || 'none'}`,
      })
    }
  }

  const transitionAt = new Date()
  const preparedRejection = body.status === 'rejected' && current.status !== 'rejected'
    ? await prepareApplicationRejection(id, orgId, transitionAt)
    : null

  const updated = await db.transaction(async (tx) => {
    const updateConditions = [
      eq(application.id, id),
      eq(application.organizationId, orgId),
    ]
    if (body.status && body.status !== current.status) {
      updateConditions.push(eq(application.status, current.status))
    }
    const [row] = await tx.update(application)
      .set({ ...body, updatedAt: transitionAt })
      .where(and(...updateConditions))
      .returning({
        id: application.id,
        candidateId: application.candidateId,
        jobId: application.jobId,
        status: application.status,
        score: application.score,
        notes: application.notes,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
      })
    if (!row) return null

    if (preparedRejection?.prepared) {
      await enqueueCandidateWorkflowEmail(tx as unknown as Pick<typeof db, 'insert'>, {
        prepared: preparedRejection.prepared,
        organizationId: orgId,
        applicationId: id,
        candidateId: row.candidateId,
        jobId: row.jobId,
        transitionAt,
      })
    }
    return row
  })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: body.status && body.status !== current.status ? 'status_changed' : 'updated',
    resourceType: 'application',
    resourceId: id,
    metadata: body.status && body.status !== current.status
      ? { from: current.status, to: body.status }
      : undefined,
  })

  // Track to PostHog for per-user debugging and funnel analytics
  if (body.status && body.status !== current.status) {
    trackEvent(event, session, 'application status_changed', {
      application_id: id,
      job_id: updated.jobId,
      from_status: current.status,
      to_status: body.status,
    })

    logApiRequest(event, session, 'application.status_changed', {
      application_id: id,
      job_id: updated.jobId,
      from_status: current.status,
      to_status: body.status,
    })
  }

  await invalidateOrgScopedDashboardCache(event)

  return updated
})

async function prepareApplicationRejection(
  applicationId: string,
  organizationId: string,
  now: Date,
) {
  const [details] = await db
    .select({
      candidateFirstName: candidate.firstName,
      candidateLastName: candidate.lastName,
      candidateEmail: candidate.email,
      jobTitle: job.title,
      organizationName: organization.name,
      applicationCreatedAt: application.createdAt,
      applicationStatus: application.status,
    })
    .from(application)
    .innerJoin(candidate, and(
      eq(candidate.id, application.candidateId),
      eq(candidate.organizationId, organizationId),
    ))
    .innerJoin(job, and(
      eq(job.id, application.jobId),
      eq(job.organizationId, organizationId),
    ))
    .innerJoin(organization, and(
      eq(organization.id, application.organizationId),
      eq(organization.id, organizationId),
    ))
    .where(and(
      eq(application.id, applicationId),
      eq(application.organizationId, organizationId),
    ))
    .limit(1)

  if (!details) throw new Error('candidate_workflow_email_context_unavailable')

  const candidateName = `${details.candidateFirstName} ${details.candidateLastName}`.trim()

  const prepared = await prepareConfiguredCandidateWorkflowEmail({
    purpose: 'application_rejection',
    now,
    data: {
      organizationId,
      candidateEmail: details.candidateEmail,
      candidateName,
      candidateFirstName: details.candidateFirstName,
      candidateLastName: details.candidateLastName,
      jobTitle: details.jobTitle,
      organizationName: details.organizationName,
      applicationDate: details.applicationCreatedAt.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      applicationStatus: 'rejected',
      dashboardApplicationUrl: `${resolveFactoryCareersBaseUrl()}/dashboard/applications/${applicationId}`,
    },
  })
  return { prepared }
}
