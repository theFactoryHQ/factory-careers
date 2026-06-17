import { job } from '../../database/schema'
import { createJobSchema } from '../../utils/schemas/job'
import { jobDescriptionBlocksToMarkdown, normalizeJobDescriptionBlocks } from '~~/shared/job-listing-structure'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['create'] })
  const orgId = session.session.activeOrganizationId

  const body = await readValidatedBody(event, createJobSchema.parse)

  // Generate a deterministic ID upfront so we can build the slug
  const jobId = crypto.randomUUID()
  const slug = generateJobSlug(body.title, jobId, body.slug)
  const descriptionBlocks = normalizeJobDescriptionBlocks(body.descriptionBlocks)
  const generatedDescription = jobDescriptionBlocksToMarkdown(descriptionBlocks)

  const [created] = await db.insert(job).values({
    id: jobId,
    organizationId: orgId,
    title: body.title,
    slug,
    description: generatedDescription || body.description,
    divisions: body.divisions,
    descriptionBlocks,
    location: body.location,
    type: body.type,
    salaryMin: body.salaryMin,
    salaryMax: body.salaryMax,
    salaryCurrency: body.salaryCurrency,
    salaryUnit: body.salaryUnit,
    salaryNegotiable: body.salaryNegotiable,
    remoteStatus: body.remoteStatus,
    activeFrom: body.activeFrom,
    validThrough: body.validThrough,
    requireResume: body.requireResume,
    requireCoverLetter: body.requireCoverLetter,
    applicationComplianceEnabled: body.applicationComplianceEnabled,
    includeEeo: body.includeEeo,
    includeVeteran: body.includeVeteran,
    includeDisability: body.includeDisability,
    autoScoreOnApply: body.autoScoreOnApply,
    scoringBands: body.scoringBands,
    experienceLevel: body.experienceLevel,
  }).returning({
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

  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create job' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'created',
    resourceType: 'job',
    resourceId: created.id,
    metadata: { title: created.title },
  })

  trackEvent(event, session, 'job created', {
    job_id: created.id,
    job_type: created.type,
    has_salary: !!(created.salaryMin || created.salaryMax),
    require_resume: created.requireResume,
    auto_score: created.autoScoreOnApply,
  })

  logApiRequest(event, session, 'job.created', {
    job_id: created.id,
    job_type: created.type,
    has_salary: !!(created.salaryMin || created.salaryMax),
    require_resume: created.requireResume,
    auto_score: created.autoScoreOnApply,
  })

  await invalidateOrgScopedDashboardCache(event)

  setResponseStatus(event, 201)
  return created
})
