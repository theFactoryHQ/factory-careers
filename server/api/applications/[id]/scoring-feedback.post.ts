import { and, desc, eq } from 'drizzle-orm'
import { resourceIdParamSchema } from '../../../utils/schemas/common'
import { application, analysisRun, analysisRunFeedback } from '../../../database/schema'
import { createScoringFeedbackSchema } from '../../../utils/schemas/scoring'


export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, resourceIdParamSchema.parse)
  const body = await readValidatedBody(event, createScoringFeedbackSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })

  if (!app) {
    throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  }

  const [latestRun] = await db.select({
    id: analysisRun.id,
  })
    .from(analysisRun)
    .where(and(
      eq(analysisRun.applicationId, applicationId),
      eq(analysisRun.organizationId, orgId),
      eq(analysisRun.status, 'completed'),
    ))
    .orderBy(desc(analysisRun.createdAt))
    .limit(1)

  if (!latestRun) {
    throw createError({ statusCode: 422, statusMessage: 'Run scoring before leaving feedback.' })
  }

  if (body.analysisRunId && body.analysisRunId !== latestRun.id) {
    throw createError({ statusCode: 409, statusMessage: 'Scoring feedback target is stale. Refresh and try again.' })
  }

  const [feedback] = await db.insert(analysisRunFeedback).values({
    organizationId: orgId,
    applicationId,
    analysisRunId: latestRun.id,
    sentiment: body.sentiment,
    comment: body.comment?.trim() || null,
    createdById: session.user.id,
  }).returning({
    id: analysisRunFeedback.id,
    sentiment: analysisRunFeedback.sentiment,
    comment: analysisRunFeedback.comment,
    analysisRunId: analysisRunFeedback.analysisRunId,
    createdAt: analysisRunFeedback.createdAt,
  })

  return { feedback }
})
