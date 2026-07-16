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
import type { ProcessingQueueDatabaseExecutor } from './processingQueue'

export type AnalyzeApplicationErrorCode =
  | 'APPLICATION_NOT_FOUND'
  | 'MISSING_CRITERIA'
  | 'RESUME_PARSE_FAILED'
  | 'RESUME_PARSE_PENDING'
  | 'RESUME_UPLOAD_PENDING'
  | 'RESUME_NO_TEXT'
  | 'RESUME_MISSING'
  | 'MISSING_JOB_DESCRIPTION'
  | 'AI_CONFIGURATION_INVALID'
  | 'PROVIDER_FAILURE'

export class AnalyzeApplicationError extends Error {
  readonly code: AnalyzeApplicationErrorCode
  readonly documentId?: string
  readonly retryable: boolean
  readonly failedRun?: {
    organizationId: string
    applicationId: string
    status: 'failed'
    provider: string
    model: string
    criteriaSnapshot: Record<string, unknown>[]
    errorMessage: string
    scoredById?: string
  }

  constructor(
    code: AnalyzeApplicationErrorCode,
    message: string,
    options: {
      documentId?: string
      cause?: unknown
      retryable?: boolean
      failedRun?: AnalyzeApplicationError['failedRun']
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AnalyzeApplicationError'
    this.code = code
    this.documentId = options.documentId
    this.retryable = options.retryable ?? false
    this.failedRun = options.failedRun
  }
}

export type AnalyzeApplicationInput = {
  organizationId: string
  applicationId: string
  aiConfigId?: string | null
  scoredById?: string
  /** Queue-only guard. Manual callers intentionally omit this to force a fresh score. */
  onlyIfUnscored?: boolean
  abortSignal?: AbortSignal
  /** Allows a claimed queue task to own the transaction that fences persistence. */
  persistenceTransaction?: <T>(operation: (
    executor: ProcessingQueueDatabaseExecutor,
  ) => Promise<T>) => Promise<T>
  /** Queue callers disable this because failed task history owns the fence. */
  recordFailedRun?: boolean
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

export type AnalyzeApplicationSkippedResult = {
  skipped: true
  reason: 'already_scored'
}

function isRetryableProviderFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true
  const candidate = error as {
    name?: string
    code?: string
    statusCode?: number
    status?: number
    response?: { status?: number }
  }
  const status = candidate.statusCode ?? candidate.status ?? candidate.response?.status
  if (status !== undefined) {
    return status === 408 || status === 409 || status === 429 || status >= 500
  }
  if (candidate.name === 'AbortError' || candidate.name === 'TimeoutError') return true
  if (candidate.code && [
    'AUTHENTICATION_ERROR',
    'INVALID_API_KEY',
    'PERMISSION_DENIED',
  ].includes(candidate.code.toUpperCase())) return false
  return true
}

function isExpectedAiConfigurationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { statusCode?: number; status?: number }
  return (candidate.statusCode ?? candidate.status) === 422
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
  onlyIfUnscored = false,
  abortSignal,
  persistenceTransaction,
  recordFailedRun = true,
}: AnalyzeApplicationInput): Promise<AnalyzeApplicationResult | AnalyzeApplicationSkippedResult> {
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

  // A zero is a real score. Missing-only work must avoid provider usage whenever
  // any score already exists.
  if (onlyIfUnscored && app.score !== null) {
    return { skipped: true, reason: 'already_scored' }
  }

  let config
  try {
    config = await loadAiConfig(organizationId, {
      purpose: 'analysis',
      preferId: aiConfigId ?? null,
    })
  } catch (error) {
    if (!isExpectedAiConfigurationError(error)) throw error
    throw new AnalyzeApplicationError(
      'AI_CONFIGURATION_INVALID',
      'AI analysis is not configured for this organization.',
      { cause: error },
    )
  }

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
      if (resumeDocument.uploadStatus === 'pending') {
        throw new AnalyzeApplicationError(
          'RESUME_UPLOAD_PENDING',
          'Resume upload is still being finalized.',
          { documentId: resumeDocument.id, retryable: true },
        )
      }
      if (resumeDocument.parseStatus === 'pending') {
        throw new AnalyzeApplicationError(
          'RESUME_PARSE_PENDING',
          'Resume parsing is still pending.',
          { documentId: resumeDocument.id, retryable: true },
        )
      }
      if (resumeDocument.parseStatus === 'no_text') {
        throw new AnalyzeApplicationError(
          'RESUME_NO_TEXT',
          'The resume contains no extractable text.',
          { documentId: resumeDocument.id },
        )
      }
      throw new AnalyzeApplicationError(
        'RESUME_PARSE_FAILED',
        'Resume was uploaded but text extraction failed. Try re-parsing the document.',
        {
          documentId: resumeDocument.id,
          retryable: false,
        },
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
    }, { abortSignal })
  }
  catch (error) {
    const message = 'AI provider request failed.'

    if (recordFailedRun) {
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
    }

    throw new AnalyzeApplicationError('PROVIDER_FAILURE', message, {
      cause: error,
      retryable: isRetryableProviderFailure(error),
      failedRun: {
        organizationId,
        applicationId,
        status: 'failed',
        provider: config.provider,
        model: config.model,
        criteriaSnapshot: criteriaDefinitions as unknown as Record<string, unknown>[],
        errorMessage: message,
        scoredById,
      },
    })
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

  const persist = async (tx: ProcessingQueueDatabaseExecutor) => {
    if (onlyIfUnscored) {
      const [lockedApplication] = await tx.select({ score: application.score })
        .from(application)
        .where(and(
          eq(application.id, applicationId),
          eq(application.organizationId, organizationId),
        ))
        .limit(1)
        .for('update')
      if (!lockedApplication) {
        throw new AnalyzeApplicationError('APPLICATION_NOT_FOUND', 'Application not found')
      }
      if (lockedApplication.score !== null) return null
    }

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
      .set({
        score: compositeScore,
        currentAnalysisRunId: run.id,
        updatedAt: new Date(),
      })
      .where(and(
        eq(application.id, applicationId),
        eq(application.organizationId, organizationId),
      ))

    return run
  }
  const createdRun = persistenceTransaction
    ? await persistenceTransaction(persist)
    : await db.transaction(tx => persist(tx as unknown as ProcessingQueueDatabaseExecutor))

  if (!createdRun) return { skipped: true, reason: 'already_scored' }

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
