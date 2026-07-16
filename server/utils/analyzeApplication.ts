import { and, eq } from 'drizzle-orm'
import {
  analysisRun,
  analysisRunCriterionScore,
  application,
  criterionScore,
  orgSettings,
  scoringCriterion,
} from '../database/schema'
import { loadApplicationResume } from './applicationResume'
import { db } from './db'
import { computeCompositeScore, scoreApplication } from './ai/scoring'
import type { CriterionDefinition, ReconciledCriterionEvaluation } from './ai/scoring'
import { loadAiConfig } from './ai/loadConfig'
import type { SupportedProvider } from './ai/provider'
import { recordActivity } from './recordActivity'
import { extractResumeText } from './resume-parser'

export type AnalyzeApplicationErrorCode =
  | 'APPLICATION_NOT_FOUND'
  | 'MISSING_CRITERIA'
  | 'RESUME_PARSE_FAILED'
  | 'RESUME_MISSING'
  | 'MISSING_JOB_DESCRIPTION'
  | 'PROVIDER_FAILURE'

export class AnalyzeApplicationError extends Error {
  readonly code: AnalyzeApplicationErrorCode
  readonly documentId?: string

  constructor(
    code: AnalyzeApplicationErrorCode,
    message: string,
    options: { documentId?: string, cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AnalyzeApplicationError'
    this.code = code
    this.documentId = options.documentId
  }
}

export type AnalyzeApplicationInput = {
  organizationId: string
  applicationId: string
  aiConfigId?: string | null
  scoredById?: string
}

export type AnalyzeApplicationResult = {
  compositeScore: number
  evaluations: ReconciledCriterionEvaluation[]
  summary: string
  analysisRunId: string
  usage: {
    promptTokens: number
    completionTokens: number
  }
}

/**
 * Analyze one application within an organization and persist its latest score
 * plus an immutable run snapshot. Callers own transport-specific error mapping.
 */
export async function analyzeApplication({
  organizationId,
  applicationId,
  aiConfigId,
  scoredById,
}: AnalyzeApplicationInput): Promise<AnalyzeApplicationResult> {
  const app = await db.query.application.findFirst({
    where: and(
      eq(application.id, applicationId),
      eq(application.organizationId, organizationId),
    ),
    with: {
      candidate: {
        columns: { id: true, firstName: true, lastName: true },
      },
      job: {
        columns: { id: true, title: true, description: true },
      },
    },
  })

  if (!app) {
    throw new AnalyzeApplicationError('APPLICATION_NOT_FOUND', 'Application not found')
  }

  const config = await loadAiConfig(organizationId, {
    purpose: 'analysis',
    preferId: aiConfigId ?? null,
  })

  const criteria = await db.select().from(scoringCriterion)
    .where(and(
      eq(scoringCriterion.jobId, app.job.id),
      eq(scoringCriterion.organizationId, organizationId),
    ))

  if (criteria.length === 0) {
    throw new AnalyzeApplicationError(
      'MISSING_CRITERIA',
      'No scoring criteria defined for this job. Add criteria first.',
    )
  }

  const resumeDocument = await loadApplicationResume(
    organizationId,
    applicationId,
    app.candidate.id,
  )
  const resumeText = extractResumeText(resumeDocument?.parsedContent)

  if (!resumeText) {
    if (resumeDocument) {
      throw new AnalyzeApplicationError(
        'RESUME_PARSE_FAILED',
        'Resume was uploaded but text extraction failed. Try re-parsing the document.',
        { documentId: resumeDocument.id },
      )
    }

    throw new AnalyzeApplicationError(
      'RESUME_MISSING',
      'No resume found for this candidate. Upload a resume first.',
    )
  }

  if (!app.job.description) {
    throw new AnalyzeApplicationError(
      'MISSING_JOB_DESCRIPTION',
      'Job description is required for AI analysis.',
    )
  }

  const criteriaDefinitions: CriterionDefinition[] = criteria.map(criterion => ({
    key: criterion.key,
    name: criterion.name,
    description: criterion.description,
    category: criterion.category,
    maxScore: criterion.maxScore,
    weight: criterion.weight,
  }))
  const settings = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.organizationId, organizationId),
    columns: { analysisContext: true },
  })

  let result
  try {
    result = await scoreApplication({
      provider: config.provider as SupportedProvider,
      model: config.model,
      apiKeyEncrypted: config.apiKeyEncrypted,
      baseUrl: config.baseUrl,
      maxTokens: config.maxTokens,
    }, {
      jobTitle: app.job.title,
      jobDescription: app.job.description,
      criteria: criteriaDefinitions,
      resumeText,
      coverLetterText: app.coverLetterText,
      applicationNotes: app.notes,
      organizationAnalysisContext: settings?.analysisContext ?? null,
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    await db.insert(analysisRun).values({
      organizationId,
      applicationId,
      status: 'failed',
      provider: config.provider,
      model: config.model,
      criteriaSnapshot: criteriaDefinitions as unknown as Record<string, unknown>[],
      errorMessage: message,
      scoredById,
    })

    throw new AnalyzeApplicationError('PROVIDER_FAILURE', message, { cause: error })
  }

  const compositeScore = computeCompositeScore(
    criteriaDefinitions,
    result.scoring.evaluations,
  )
  const scoreValues = result.scoring.evaluations.map(evaluation => ({
    organizationId,
    applicationId,
    criterionKey: evaluation.criterionKey,
    maxScore: evaluation.maxScore,
    applicantScore: evaluation.applicantScore,
    confidence: evaluation.confidence,
    evidence: evaluation.evidence,
    strengths: evaluation.strengths,
    gaps: evaluation.gaps,
  }))

  const createdRun = await db.transaction(async (tx) => {
    const [run] = await tx.insert(analysisRun).values({
      organizationId,
      applicationId,
      status: 'completed',
      provider: config.provider,
      model: config.model,
      criteriaSnapshot: criteriaDefinitions as unknown as Record<string, unknown>[],
      rawResponse: result.scoring,
      compositeScore,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      scoredById,
    }).returning()

    if (!run) {
      throw new Error('Analysis run could not be created')
    }

    await tx.delete(criterionScore)
      .where(and(
        eq(criterionScore.applicationId, applicationId),
        eq(criterionScore.organizationId, organizationId),
      ))

    if (scoreValues.length > 0) {
      await tx.insert(criterionScore).values(scoreValues)
      await tx.insert(analysisRunCriterionScore).values(scoreValues.map(score => ({
        ...score,
        analysisRunId: run.id,
      })))
    }

    await tx.update(application)
      .set({ score: compositeScore, updatedAt: new Date() })
      .where(and(
        eq(application.id, applicationId),
        eq(application.organizationId, organizationId),
      ))

    return run
  })

  if (scoredById) {
    void recordActivity({
      organizationId,
      actorId: scoredById,
      action: 'scored',
      resourceType: 'application',
      resourceId: applicationId,
      metadata: {
        compositeScore,
        model: config.model,
        criterionCount: result.scoring.evaluations.length,
      },
    })
  }

  return {
    compositeScore,
    evaluations: result.scoring.evaluations,
    summary: result.scoring.summary,
    analysisRunId: createdRun.id,
    usage: result.usage,
  }
}
