import { eq, and } from 'drizzle-orm'
import { job } from '../../database/schema'
import { idParamSchema, updateJobSchema, JOB_STATUS_TRANSITIONS } from '../../utils/schemas/job'
import { jobDescriptionBlocksToMarkdown, normalizeJobDescriptionBlocks } from '~~/shared/job-listing-structure'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)
  const body = await readValidatedBody(event, updateJobSchema.parse)

  // Fetch existing job — needed for status transition check and slug regeneration
  const existing = await db.query.job.findFirst({
    where: and(eq(job.id, id), eq(job.organizationId, orgId)),
    columns: { status: true, title: true, slug: true },
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  // Validate status transition if status is being changed
  if (body.status) {
    const allowed = JOB_STATUS_TRANSITIONS[existing.status] ?? []
    if (!allowed.includes(body.status)) {
      throw createError({
        statusCode: 422,
        statusMessage: `Cannot transition from '${existing.status}' to '${body.status}'`,
      })
    }
  }

  // Regenerate slug when title or custom slug changes
  const updates: Record<string, unknown> = { ...body, updatedAt: new Date() }
  delete (updates as any).slug // remove raw slug from spread — we set it explicitly below
  if (body.descriptionBlocks !== undefined) {
    const descriptionBlocks = normalizeJobDescriptionBlocks(body.descriptionBlocks)
    updates.descriptionBlocks = descriptionBlocks
    updates.description = jobDescriptionBlocksToMarkdown(descriptionBlocks) || null
  }
  if (body.title !== undefined || body.slug !== undefined) {
    updates.slug = await generateUniqueJobSlug({
      title: body.title ?? existing.title,
      id,
      customSlug: body.slug,
      currentJobId: id,
    })
  }

  const [updated] = await db.update(job)
    .set(updates)
    .where(and(eq(job.id, id), eq(job.organizationId, orgId)))
    .returning({
      id: job.id,
      title: job.title,
      slug: job.slug,
      description: job.description,
      divisions: job.divisions,
      descriptionBlocks: job.descriptionBlocks,
      location: job.location,
      type: job.type,
      status: job.status,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      salaryUnit: job.salaryUnit,
      salaryNegotiable: job.salaryNegotiable,
      remoteStatus: job.remoteStatus,
      activeFrom: job.activeFrom,
      validThrough: job.validThrough,
      requireResume: job.requireResume,
      requireCoverLetter: job.requireCoverLetter,
      applicationComplianceEnabled: job.applicationComplianceEnabled,
      includeEeo: job.includeEeo,
      includeVeteran: job.includeVeteran,
      includeDisability: job.includeDisability,
      autoScoreOnApply: job.autoScoreOnApply,
      scoringBands: job.scoringBands,
      experienceLevel: job.experienceLevel,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: body.status && body.status !== existing.status ? 'status_changed' : 'updated',
    resourceType: 'job',
    resourceId: id,
    metadata: body.status && body.status !== existing.status
      ? { from: existing.status, to: body.status }
      : { title: updated.title },
  })

  if (body.status && body.status !== existing.status) {
    trackEvent(event, session, 'job status_changed', {
      job_id: id,
      from_status: existing.status,
      to_status: body.status,
    })

    logApiRequest(event, session, 'job.status_changed', {
      job_id: id,
      from_status: existing.status,
      to_status: body.status,
    })
  }

  await invalidateOrgScopedDashboardCache(event)

  return updated
})
