import { and, eq } from 'drizzle-orm'
import { resourceIdParamSchema } from '../../../utils/schemas/common'
import { application, analysisRunFeedback } from '../../../database/schema'
import { createScoringFeedbackSchema } from '../../../utils/schemas/scoring'


export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, resourceIdParamSchema.parse)
  const body = await readValidatedBody(event, createScoringFeedbackSchema.parse)

  const feedback = await db.transaction(async (tx) => {
    const [app] = await tx.select({
      id: application.id,
      currentAnalysisRunId: application.currentAnalysisRunId,
    })
      .from(application)
      .where(and(eq(application.id, applicationId), eq(application.organizationId, orgId)))
      .limit(1)
      .for('update')

    if (!app) {
      throw createError({ statusCode: 404, statusMessage: 'Application not found' })
    }

    if (!app.currentAnalysisRunId) {
      throw createError({ statusCode: 422, statusMessage: 'Run scoring before leaving feedback.' })
    }

    if (body.analysisRunId && body.analysisRunId !== app.currentAnalysisRunId) {
      throw createError({ statusCode: 409, statusMessage: 'Scoring feedback target is stale. Refresh and try again.' })
    }

    const [createdFeedback] = await tx.insert(analysisRunFeedback).values({
      organizationId: orgId,
      applicationId,
      analysisRunId: app.currentAnalysisRunId,
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

    return createdFeedback
  })

  return { feedback }
})
