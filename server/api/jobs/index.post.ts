import { job } from '../../database/schema'
import { createJobSchema } from '../../utils/schemas/job'
import { jobDescriptionBlocksToMarkdown, normalizeJobDescriptionBlocks } from '~~/shared/job-listing-structure'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['create'] })
  const orgId = session.session.activeOrganizationId

  const body = await readValidatedBody(event, createJobSchema.parse)

  // Generate a deterministic ID upfront so we can return it immediately.
  const jobId = crypto.randomUUID()
  const descriptionBlocks = normalizeJobDescriptionBlocks(body.descriptionBlocks)
  const generatedDescription = jobDescriptionBlocksToMarkdown(descriptionBlocks)

  let created
  for (let attempt = 0; attempt < MAX_JOB_SLUG_WRITE_RETRIES; attempt++) {
    const slug = await generateUniqueJobSlug({ title: body.title, id: jobId, customSlug: body.slug })

    try {
      const [inserted] = await db.insert(job).values({
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
        salaryDisplayOnListing: body.salaryDisplayOnListing,
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
        salaryDisplayOnListing: job.salaryDisplayOnListing,
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
      created = inserted
      break
    } catch (error) {
      if (!isJobSlugUniqueViolation(error)) throw error
      if (attempt === MAX_JOB_SLUG_WRITE_RETRIES - 1) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Could not generate a unique job URL slug. Enter a custom slug and try again.',
        })
      }
    }
  }

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
    has_salary: created.salaryMin != null || created.salaryMax != null,
    require_resume: created.requireResume,
    auto_score: created.autoScoreOnApply,
  })

  logApiRequest(event, session, 'job.created', {
    job_id: created.id,
    job_type: created.type,
    has_salary: created.salaryMin != null || created.salaryMax != null,
    require_resume: created.requireResume,
    auto_score: created.autoScoreOnApply,
  })

  await invalidateOrgScopedDashboardCache(event)

  setResponseStatus(event, 201)
  return created
})
