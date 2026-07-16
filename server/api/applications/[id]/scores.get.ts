import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'
import { resourceIdParamSchema } from '../../../utils/schemas/common'
import {
  analysisRun,
  analysisRunCriterionScore,
  application,
  job,
  orgSettings,
} from '../../../database/schema'
import { DEFAULT_SCORING_BANDS, findScoringBand, resolveScoringBands } from '~~/shared/scoring-bands'


function extractAnalysisSummary(rawResponse: unknown) {
  if (!rawResponse || typeof rawResponse !== 'object') {
    return null
  }

  const summary = (rawResponse as { summary?: unknown }).summary
  return typeof summary === 'string' && summary.trim() ? summary.trim() : null
}

const criterionSnapshotSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  weight: z.number().finite(),
})

function parseCriteriaSnapshot(rawSnapshot: unknown) {
  const criteria = new Map<string, z.infer<typeof criterionSnapshotSchema>>()
  if (!Array.isArray(rawSnapshot)) return criteria

  for (const entry of rawSnapshot) {
    const parsed = criterionSnapshotSchema.safeParse(entry)
    if (parsed.success) criteria.set(parsed.data.key, parsed.data)
  }
  return criteria
}

/**
 * GET /api/applications/:id/scores
 * Get the score breakdown for an application, including individual criterion scores
 * and the exact successful analysis run backing the persisted score.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, resourceIdParamSchema.parse)

  // Verify application belongs to org
  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true, score: true, jobId: true, currentAnalysisRunId: true },
  })
  if (!app) {
    throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  }

  // Criterion rows and run metadata are both read through the same persisted
  // pointer so a concurrent re-score cannot mix generations in this response.
  const rawScores = app.currentAnalysisRunId
    ? await db.select({
        criterionKey: analysisRunCriterionScore.criterionKey,
        maxScore: analysisRunCriterionScore.maxScore,
        score: analysisRunCriterionScore.applicantScore,
        confidence: analysisRunCriterionScore.confidence,
        evidence: analysisRunCriterionScore.evidence,
        strengths: analysisRunCriterionScore.strengths,
        gaps: analysisRunCriterionScore.gaps,
      })
        .from(analysisRunCriterionScore)
        .where(and(
          eq(analysisRunCriterionScore.analysisRunId, app.currentAnalysisRunId),
          eq(analysisRunCriterionScore.applicationId, applicationId),
          eq(analysisRunCriterionScore.organizationId, orgId),
        ))
    : []

  // The successful run backs the persisted score while the latest attempt
  // independently surfaces retry failures without replacing valid metadata.
  const [latestSuccessfulRun] = app.currentAnalysisRunId
    ? await db.select({
        id: analysisRun.id,
        status: analysisRun.status,
        provider: analysisRun.provider,
        model: analysisRun.model,
        compositeScore: analysisRun.compositeScore,
        promptTokens: analysisRun.promptTokens,
        completionTokens: analysisRun.completionTokens,
        criteriaSnapshot: analysisRun.criteriaSnapshot,
        rawResponse: analysisRun.rawResponse,
        createdAt: analysisRun.createdAt,
      })
        .from(analysisRun)
        .where(and(
          eq(analysisRun.id, app.currentAnalysisRunId),
          eq(analysisRun.applicationId, applicationId),
          eq(analysisRun.organizationId, orgId),
          eq(analysisRun.status, 'completed'),
        ))
        .limit(1)
    : []

  const [latestAttempt] = await db.select({
    id: analysisRun.id,
    status: analysisRun.status,
    provider: analysisRun.provider,
    model: analysisRun.model,
    compositeScore: analysisRun.compositeScore,
    promptTokens: analysisRun.promptTokens,
    completionTokens: analysisRun.completionTokens,
    createdAt: analysisRun.createdAt,
  })
    .from(analysisRun)
    .where(and(
      eq(analysisRun.applicationId, applicationId),
      eq(analysisRun.organizationId, orgId),
    ))
    .orderBy(desc(analysisRun.createdAt))
    .limit(1)

  const criteriaSnapshot = parseCriteriaSnapshot(latestSuccessfulRun?.criteriaSnapshot)
  const scores = rawScores.map((score) => {
    const criterion = criteriaSnapshot.get(score.criterionKey)
    return {
      ...score,
      criterionName: criterion?.name ?? score.criterionKey,
      weight: criterion?.weight ?? 0,
      category: criterion?.category ?? null,
    }
  })

  const [bandSettings] = await db.select({
    jobBands: job.scoringBands,
    globalBands: orgSettings.scoringBands,
  })
    .from(job)
    .leftJoin(orgSettings, eq(orgSettings.organizationId, orgId))
    .where(and(
      eq(job.id, app.jobId),
      eq(job.organizationId, orgId),
    ))
    .limit(1)

  const scoringBands = resolveScoringBands({
    globalBands: bandSettings?.globalBands ?? DEFAULT_SCORING_BANDS,
    jobBands: bandSettings?.jobBands ?? null,
  })
  const scoreBand = findScoringBand(app.score, scoringBands)

  return {
    applicationId,
    compositeScore: app.score,
    scoringBands,
    scoreBand,
    scores,
    latestSuccessfulRun: latestSuccessfulRun
      ? {
          id: latestSuccessfulRun.id,
          status: latestSuccessfulRun.status,
          provider: latestSuccessfulRun.provider,
          model: latestSuccessfulRun.model,
          compositeScore: latestSuccessfulRun.compositeScore,
          promptTokens: latestSuccessfulRun.promptTokens,
          completionTokens: latestSuccessfulRun.completionTokens,
          createdAt: latestSuccessfulRun.createdAt,
          summary: extractAnalysisSummary(latestSuccessfulRun.rawResponse),
        }
      : null,
    latestAttempt: latestAttempt
      ? {
          id: latestAttempt.id,
          status: latestAttempt.status,
          provider: latestAttempt.provider,
          model: latestAttempt.model,
          compositeScore: latestAttempt.compositeScore,
          promptTokens: latestAttempt.promptTokens,
          completionTokens: latestAttempt.completionTokens,
          createdAt: latestAttempt.createdAt,
        }
      : null,
  }
})
