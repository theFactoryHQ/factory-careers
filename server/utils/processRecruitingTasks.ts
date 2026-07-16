import { and, eq } from 'drizzle-orm'
import { analysisRun, application, document, job } from '../database/schema'
import { AnalyzeApplicationError, analyzeApplication } from './analyzeApplication'
import { db } from './db'
import {
  parseFailurePersistence,
  parseResultPersistence,
  type DocumentParsePersistence,
} from './documentParseOutcome'
import {
  DEFAULT_DOCUMENT_PARSE_TIMEOUT_MS,
  DocumentParseError,
  parseDocumentDetailed,
} from './resume-parser'
import { deleteFromS3, downloadFromS3, objectExistsInS3 } from './s3'
import {
  claimProcessingTasks,
  completeProcessingTask,
  completeProcessingTaskWithDomainWrite,
  completeProcessingTaskWithDomainOutcome,
  completeProcessingTaskWithResourceCleanup,
  enqueueProcessingTask,
  failProcessingTask,
  failProcessingTaskWithDomainWrite,
  isDocumentUploadReconciliationEligible,
  renewProcessingTaskLease,
  type ClaimProcessingTasksInput,
  type FailProcessingTaskInput,
  type ProcessingTaskRecord,
  type ProcessingTaskType,
} from './processingQueue'

export const RECRUITING_TASK_TYPES = [
  'application_analysis',
  'document_parse',
  'document_upload_reconciliation',
] as const satisfies readonly ProcessingTaskType[]

export const MAX_RECRUITING_TASK_CONCURRENCY = 5

type FailureClassification = { resultCode: string; retryable: boolean }

export class RecruitingTaskError extends Error {
  constructor(
    readonly resultCode: string,
    readonly retryable: boolean,
    options: { cause?: unknown } = {},
  ) {
    super('Recruiting task failed', options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'RecruitingTaskError'
  }
}

class RecruitingTaskHandledFailure extends RecruitingTaskError {
  readonly handled = true
}

export function classifyRecruitingTaskError(error: unknown): FailureClassification {
  if (error instanceof RecruitingTaskError) {
    return { resultCode: error.resultCode, retryable: error.retryable }
  }
  if (error instanceof DocumentParseError) {
    return { resultCode: error.code, retryable: error.retryable }
  }
  if (error instanceof AnalyzeApplicationError) {
    const classifications: Record<AnalyzeApplicationError['code'], FailureClassification> = {
      APPLICATION_NOT_FOUND: { resultCode: 'application_not_found', retryable: false },
      MISSING_CRITERIA: { resultCode: 'missing_criteria', retryable: false },
      RESUME_PARSE_FAILED: { resultCode: 'resume_parse_failed', retryable: false },
      RESUME_PARSE_PENDING: { resultCode: 'resume_parse_pending', retryable: true },
      RESUME_UPLOAD_PENDING: { resultCode: 'resume_upload_pending', retryable: true },
      RESUME_NO_TEXT: { resultCode: 'resume_no_text', retryable: false },
      RESUME_MISSING: { resultCode: 'resume_missing', retryable: false },
      MISSING_JOB_DESCRIPTION: { resultCode: 'missing_job_description', retryable: false },
      AI_CONFIGURATION_INVALID: { resultCode: 'ai_configuration_invalid', retryable: false },
      PROVIDER_FAILURE: { resultCode: 'provider_failure', retryable: true },
    }
    const classification = classifications[error.code]
    return error.code === 'PROVIDER_FAILURE'
      ? { ...classification, retryable: error.retryable }
      : error.retryable
        ? { ...classification, retryable: true }
        : classification
  }
  if (typeof error === 'object' && error !== null && 'name' in error
    && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return {
      resultCode: error.name === 'TimeoutError' ? 'processing_timeout' : 'processing_aborted',
      retryable: true,
    }
  }
  return { resultCode: 'processing_failed', retryable: true }
}

export type ProcessRecruitingTasksInput = {
  organizationId: string
  batchId?: string
  limit?: number
  types?: ProcessingTaskType[]
  abortSignal?: AbortSignal
}

export type RecruitingTaskProcessorDependencies = {
  claimTasks(input: ClaimProcessingTasksInput): Promise<ProcessingTaskRecord[]>
  processTask(task: ProcessingTaskRecord, abortSignal: AbortSignal): Promise<void>
  failTask(input: FailProcessingTaskInput): Promise<ProcessingTaskRecord | null>
  renewLease(input: {
    organizationId: string
    taskId: string
    expectedAttemptCount: number
    leaseMs?: number
  }): Promise<ProcessingTaskRecord | null>
  logFailure(input: {
    taskType: ProcessingTaskType
    resultCode: string
    retryable: boolean
  }): void
  heartbeatMs: number
}

const defaultDependencies: RecruitingTaskProcessorDependencies = {
  claimTasks: claimProcessingTasks,
  processTask: processClaimedRecruitingTask,
  failTask: failProcessingTask,
  renewLease: renewProcessingTaskLease,
  logFailure(input) {
    logError('recruiting_processing.task_failed', {
      task_type: input.taskType,
      result_code: input.resultCode,
      retryable: input.retryable,
    })
  },
  heartbeatMs: 30_000,
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  limit: number,
  operation: (item: T) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length)
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++
        results[index] = await operation(items[index]!)
      }
    },
  )
  await Promise.all(workers)
  return results
}

export async function processRecruitingTasks(
  input: ProcessRecruitingTasksInput,
  dependencies: RecruitingTaskProcessorDependencies = defaultDependencies,
): Promise<{ claimed: number; succeeded: number; failed: number }> {
  const requestedLimit = Number.isFinite(input.limit) && (input.limit ?? 0) > 0
    ? Math.floor(input.limit!)
    : MAX_RECRUITING_TASK_CONCURRENCY
  const tasks = await dependencies.claimTasks({
    organizationId: input.organizationId,
    batchId: input.batchId,
    types: input.types ?? [...RECRUITING_TASK_TYPES],
    limit: Math.min(requestedLimit, MAX_RECRUITING_TASK_CONCURRENCY),
  })
  const outcomes = await mapWithConcurrency(tasks, MAX_RECRUITING_TASK_CONCURRENCY, async (task) => {
    const controller = new AbortController()
    const abortFromParent = () => controller.abort()
    if (input.abortSignal?.aborted) controller.abort()
    else input.abortSignal?.addEventListener('abort', abortFromParent, { once: true })
    let renewing = false
    let stale = false
    const inFlightRenewals = new Set<Promise<void>>()
    const heartbeat = setInterval(() => {
      if (renewing || controller.signal.aborted) return
      renewing = true
      const renewal = (async () => {
        try {
          const renewed = await dependencies.renewLease({
            organizationId: task.organizationId,
            taskId: task.id,
            expectedAttemptCount: task.attemptCount,
          })
          if (!renewed) {
            stale = true
            controller.abort()
          }
        } catch {
          stale = true
          controller.abort()
        } finally {
          renewing = false
        }
      })()
      inFlightRenewals.add(renewal)
      void renewal.finally(() => inFlightRenewals.delete(renewal))
    }, dependencies.heartbeatMs)
    heartbeat.unref?.()

    try {
      await dependencies.processTask(task, controller.signal)
      return 'succeeded' as const
    } catch (error) {
      if (!stale) {
        const classification = classifyRecruitingTaskError(error)
        dependencies.logFailure({ taskType: task.type, ...classification })
        if (!(error instanceof RecruitingTaskHandledFailure)) {
          try {
            await dependencies.failTask({
              organizationId: task.organizationId,
              taskId: task.id,
              expectedAttemptCount: task.attemptCount,
              resultCode: classification.resultCode,
              retryable: classification.retryable,
            })
          } catch {
            // A cancellation or lease handoff won the fence. Never overwrite it.
          }
        }
      }
      return 'failed' as const
    } finally {
      clearInterval(heartbeat)
      await Promise.allSettled([...inFlightRenewals])
      input.abortSignal?.removeEventListener('abort', abortFromParent)
    }
  })

  return {
    claimed: tasks.length,
    succeeded: outcomes.filter(outcome => outcome === 'succeeded').length,
    failed: outcomes.filter(outcome => outcome === 'failed').length,
  }
}

const STORAGE_TIMEOUT_MS = 60_000
const PROVIDER_TIMEOUT_MS = 2 * 60_000

/** @internal Exported for timeout and cancellation contract tests. */
export async function withBoundedAbort<T>(
  parentSignal: AbortSignal,
  timeoutMs: number,
  timeoutCode: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  let rejectControl!: (error: unknown) => void
  const control = new Promise<never>((_resolve, reject) => {
    rejectControl = reject
  })
  const abortFromParent = () => {
    const error = new Error('Recruiting task processing was aborted')
    error.name = 'AbortError'
    rejectControl(error)
    controller.abort()
  }
  if (parentSignal.aborted) abortFromParent()
  else parentSignal.addEventListener('abort', abortFromParent, { once: true })
  const timeout = setTimeout(() => {
    rejectControl(new RecruitingTaskError(timeoutCode, true))
    controller.abort()
  }, timeoutMs)
  timeout.unref?.()
  try {
    return await Promise.race([
      operation(controller.signal),
      control,
    ])
  } finally {
    clearTimeout(timeout)
    parentSignal.removeEventListener('abort', abortFromParent)
  }
}

function staleLeaseError(): Error {
  const error = new Error('Processing task lease is stale')
  error.name = 'AbortError'
  return error
}

async function loadProcessingDocument(task: ProcessingTaskRecord) {
  const [candidateDocument] = await db.select({
    id: document.id,
    organizationId: document.organizationId,
    candidateId: document.candidateId,
    applicationId: document.applicationId,
    type: document.type,
    storageKey: document.storageKey,
    mimeType: document.mimeType,
    uploadStatus: document.uploadStatus,
    parseStatus: document.parseStatus,
    parseRetryable: document.parseRetryable,
    createdAt: document.createdAt,
  })
    .from(document)
    .where(and(
      eq(document.id, task.resourceId),
      eq(document.organizationId, task.organizationId),
    ))
    .limit(1)
  return candidateDocument ?? null
}

type AutomaticAnalysisDocument = Pick<
  typeof document.$inferSelect,
  'id' | 'type' | 'uploadStatus' | 'parseStatus'
>

export function shouldEnqueueAutomaticAnalysis(
  applicationRecord: { autoScoreOnApply: boolean; score: number | null },
  associatedDocuments: AutomaticAnalysisDocument[],
  readyDocument?: Pick<AutomaticAnalysisDocument, 'id'> & {
    uploadStatus: 'completed'
    parseStatus: 'parsed'
  },
): boolean {
  if (!applicationRecord.autoScoreOnApply || applicationRecord.score !== null) return false
  const projectedDocuments = associatedDocuments.map(row =>
    row.id === readyDocument?.id ? { ...row, ...readyDocument } : row,
  )
  return projectedDocuments.length > 0
    && projectedDocuments.every(row => row.uploadStatus === 'completed')
    && projectedDocuments.some(row => row.type === 'resume' && row.parseStatus === 'parsed')
}

async function maybeEnqueueAutomaticAnalysis(
  organizationId: string,
  applicationId: string | null,
  readyDocument?: {
    id: string
    uploadStatus: 'completed'
    parseStatus: 'parsed'
  },
): Promise<void> {
  if (!applicationId) return
  const [applicationRecord] = await db.select({
    id: application.id,
    score: application.score,
    autoScoreOnApply: job.autoScoreOnApply,
  })
    .from(application)
    .innerJoin(job, and(
      eq(job.id, application.jobId),
      eq(job.organizationId, application.organizationId),
    ))
    .where(and(
      eq(application.id, applicationId),
      eq(application.organizationId, organizationId),
    ))
    .limit(1)
  if (!applicationRecord) return
  const associatedDocuments = await db.select({
    id: document.id,
    type: document.type,
    uploadStatus: document.uploadStatus,
    parseStatus: document.parseStatus,
  })
    .from(document)
    .where(and(
      eq(document.applicationId, applicationId),
      eq(document.organizationId, organizationId),
    ))
  if (!shouldEnqueueAutomaticAnalysis(applicationRecord, associatedDocuments, readyDocument)) return
  await enqueueProcessingTask({
    organizationId,
    type: 'application_analysis',
    resourceId: applicationId,
  })
}

/**
 * Queue dependent analysis before terminalizing its source document task. If
 * enqueueing fails, the source lease remains retryable instead of losing work.
 */
export async function completeDocumentTaskAfterFollowOn<T>(
  parseStatus: DocumentParsePersistence['parseStatus'],
  enqueueFollowOn: () => Promise<void>,
  completeSourceTask: () => Promise<T>,
): Promise<T> {
  if (parseStatus === 'parsed') await enqueueFollowOn()
  return completeSourceTask()
}

export function analysisTaskCompletionOutcome<T>(result: T) {
  return {
    result,
    resultCode: result === null ? 'already_scored' : 'analysis_completed',
  }
}

async function processApplicationAnalysisTask(
  task: ProcessingTaskRecord,
  abortSignal: AbortSignal,
): Promise<void> {
  let completedByPersistence = false
  let result
  try {
    result = await withBoundedAbort(
      abortSignal,
      PROVIDER_TIMEOUT_MS,
      'provider_timeout',
      signal => analyzeApplication({
      organizationId: task.organizationId,
      applicationId: task.resourceId,
      onlyIfUnscored: true,
      abortSignal: signal,
      recordFailedRun: false,
      persistenceTransaction: async (operation) => {
        const completed = await completeProcessingTaskWithDomainOutcome({
          organizationId: task.organizationId,
          taskId: task.id,
          expectedAttemptCount: task.attemptCount,
        }, async executor => analysisTaskCompletionOutcome(await operation(executor)))
        if (!completed) throw staleLeaseError()
        completedByPersistence = true
        return completed.result
      },
      }),
    )
  } catch (error) {
    if (error instanceof AnalyzeApplicationError
      && error.code === 'PROVIDER_FAILURE'
      && error.failedRun) {
      const classification = classifyRecruitingTaskError(error)
      const failed = await failProcessingTaskWithDomainWrite({
        organizationId: task.organizationId,
        taskId: task.id,
        expectedAttemptCount: task.attemptCount,
        resultCode: classification.resultCode,
        retryable: classification.retryable,
      }, async (executor) => {
        await executor.insert(analysisRun).values(error.failedRun!)
      })
      if (!failed) throw staleLeaseError()
      throw new RecruitingTaskHandledFailure(
        classification.resultCode,
        classification.retryable,
        { cause: error },
      )
    }
    throw error
  }
  if ('skipped' in result && !completedByPersistence) {
    const completed = await completeProcessingTask({
      organizationId: task.organizationId,
      taskId: task.id,
      expectedAttemptCount: task.attemptCount,
      resultCode: 'already_scored',
    })
    if (!completed) throw staleLeaseError()
  }
}

async function persistDocumentParseFailure(
  task: ProcessingTaskRecord,
  error: DocumentParseError,
): Promise<never> {
  const persistence = parseFailurePersistence(
    error,
    !error.retryable || task.attemptCount >= task.maxAttempts,
  )
  const failed = await failProcessingTaskWithDomainWrite({
    organizationId: task.organizationId,
    taskId: task.id,
    expectedAttemptCount: task.attemptCount,
    resultCode: error.code,
    retryable: error.retryable,
  }, async (executor) => {
    await executor.update(document)
      .set(persistence)
      .where(and(
        eq(document.id, task.resourceId),
        eq(document.organizationId, task.organizationId),
      ))
  })
  if (!failed) throw staleLeaseError()
  throw new RecruitingTaskHandledFailure(error.code, error.retryable, { cause: error })
}

async function processDocumentParseTask(
  task: ProcessingTaskRecord,
  abortSignal: AbortSignal,
): Promise<void> {
  const candidateDocument = await loadProcessingDocument(task)
  if (!candidateDocument) throw new RecruitingTaskError('document_not_found', false)
  if (candidateDocument.uploadStatus !== 'completed') {
    throw new RecruitingTaskError('upload_pending', true)
  }
  if (candidateDocument.parseStatus === 'parsed' || candidateDocument.parseStatus === 'no_text') {
    const completed = await completeProcessingTask({
      organizationId: task.organizationId,
      taskId: task.id,
      expectedAttemptCount: task.attemptCount,
      resultCode: 'parse_already_complete',
    })
    if (!completed) throw staleLeaseError()
    return
  }
  if (candidateDocument.parseStatus === 'failed') {
    throw new RecruitingTaskError('parse_requires_manual_reset', false)
  }

  let buffer: Buffer
  try {
    buffer = await withBoundedAbort(abortSignal, STORAGE_TIMEOUT_MS, 'storage_timeout', signal =>
      downloadFromS3(candidateDocument.storageKey, { abortSignal: signal }),
    )
  } catch (error) {
    if (error instanceof RecruitingTaskError) throw error
    throw new RecruitingTaskError('storage_download_failed', true, { cause: error })
  }

  const persistence: DocumentParsePersistence = await (async () => {
    try {
      return parseResultPersistence(await parseDocumentDetailed(
        buffer,
        candidateDocument.mimeType,
        { abortSignal, timeoutMs: DEFAULT_DOCUMENT_PARSE_TIMEOUT_MS },
      ))
    } catch (error) {
      const parseError = error instanceof DocumentParseError
        ? error
        : new DocumentParseError('parser_runtime_error', true, error)
      return persistDocumentParseFailure(task, parseError)
    }
  })()
  const completed = await completeDocumentTaskAfterFollowOn(
    persistence.parseStatus,
    () => maybeEnqueueAutomaticAnalysis(
      task.organizationId,
      candidateDocument.applicationId,
      {
        id: candidateDocument.id,
        uploadStatus: 'completed',
        parseStatus: 'parsed',
      },
    ),
    () => completeProcessingTaskWithDomainWrite({
      organizationId: task.organizationId,
      taskId: task.id,
      expectedAttemptCount: task.attemptCount,
      resultCode: persistence.parseStatus === 'parsed' ? 'parse_completed' : 'no_extractable_text',
    }, async (executor) => {
      await executor.update(document)
        .set(persistence)
        .where(and(
          eq(document.id, candidateDocument.id),
          eq(document.organizationId, task.organizationId),
        ))
    }),
  )
  if (!completed) throw staleLeaseError()
}

async function rollbackMissingUpload(
  task: ProcessingTaskRecord,
  candidateDocument: NonNullable<Awaited<ReturnType<typeof loadProcessingDocument>>>,
): Promise<void> {
  const applicationId = candidateDocument.applicationId
  const fenced = await completeProcessingTaskWithResourceCleanup({
    organizationId: task.organizationId,
    taskId: task.id,
    expectedAttemptCount: task.attemptCount,
    resultCode: applicationId ? 'application_upload_missing' : 'upload_missing',
    resourceTargets: [
      ...(applicationId
        ? [{ type: 'application_analysis' as const, resourceId: applicationId }]
        : []),
      { type: 'document_parse', resourceId: candidateDocument.id },
    ],
    cancellationResultCode: 'resource_removed',
  }, async (executor) => {
    if (!applicationId) {
      return {
        cancellationTargets: [
          { type: 'document_parse' as const, resourceId: candidateDocument.id },
        ],
        value: [candidateDocument.storageKey],
      }
    }

    // The application advisory lock above freezes its associated document set.
    const applicationDocuments = await executor.select({
      id: document.id,
      storageKey: document.storageKey,
    })
      .from(document)
      .where(and(
        eq(document.applicationId, applicationId),
        eq(document.organizationId, task.organizationId),
      ))
      .orderBy(document.id)
    return {
      cancellationTargets: [
        { type: 'application_analysis', resourceId: applicationId },
        ...applicationDocuments.flatMap(row => [
          { type: 'document_parse' as const, resourceId: row.id },
          ...(row.id === candidateDocument.id
            ? []
            : [{ type: 'document_upload_reconciliation' as const, resourceId: row.id }]),
        ]),
      ],
      value: applicationDocuments.map(row => row.storageKey),
    }
  }, async (executor, _lockedTask, storageKeys) => {
    if (!applicationId) {
      await executor.delete(document)
        .where(and(
          eq(document.id, candidateDocument.id),
          eq(document.organizationId, task.organizationId),
          eq(document.uploadStatus, 'pending'),
        ))
      return storageKeys
    }
    await executor.delete(document)
      .where(and(
        eq(document.applicationId, applicationId),
        eq(document.organizationId, task.organizationId),
      ))
    await executor.delete(application)
      .where(and(
        eq(application.id, applicationId),
        eq(application.organizationId, task.organizationId),
      ))
    return storageKeys
  })
  if (!fenced) throw staleLeaseError()
  const cleanup = await Promise.allSettled(fenced.result.map(storageKey => deleteFromS3(storageKey)))
  if (cleanup.some(result => result.status === 'rejected')) {
    logWarn('recruiting_processing.storage_cleanup_failed', {
      result_code: 'storage_cleanup_failed',
    })
  }
}

async function processUploadReconciliationTask(
  task: ProcessingTaskRecord,
  abortSignal: AbortSignal,
): Promise<void> {
  const candidateDocument = await loadProcessingDocument(task)
  if (!candidateDocument) {
    const completed = await completeProcessingTask({
      organizationId: task.organizationId,
      taskId: task.id,
      expectedAttemptCount: task.attemptCount,
      resultCode: 'resource_missing',
    })
    if (!completed) throw staleLeaseError()
    return
  }
  if (candidateDocument.uploadStatus === 'completed') {
    if (candidateDocument.parseStatus === 'pending') {
      await enqueueProcessingTask({
        organizationId: task.organizationId,
        type: 'document_parse',
        resourceId: candidateDocument.id,
      })
    }
    const completed = await completeProcessingTask({
      organizationId: task.organizationId,
      taskId: task.id,
      expectedAttemptCount: task.attemptCount,
      resultCode: 'upload_already_completed',
    })
    if (!completed) throw staleLeaseError()
    return
  }
  if (!isDocumentUploadReconciliationEligible(candidateDocument)) {
    throw new RecruitingTaskError('upload_grace_period', true)
  }

  let exists: boolean
  try {
    exists = await withBoundedAbort(abortSignal, STORAGE_TIMEOUT_MS, 'storage_timeout', signal =>
      objectExistsInS3(candidateDocument.storageKey, { abortSignal: signal }),
    )
  } catch (error) {
    if (error instanceof RecruitingTaskError) throw error
    throw new RecruitingTaskError('storage_check_failed', true, { cause: error })
  }
  if (!exists) {
    await rollbackMissingUpload(task, candidateDocument)
    return
  }

  let buffer: Buffer
  try {
    buffer = await withBoundedAbort(abortSignal, STORAGE_TIMEOUT_MS, 'storage_timeout', signal =>
      downloadFromS3(candidateDocument.storageKey, { abortSignal: signal }),
    )
  } catch (error) {
    if (error instanceof RecruitingTaskError) throw error
    throw new RecruitingTaskError('storage_download_failed', true, { cause: error })
  }
  let persistence
  try {
    persistence = parseResultPersistence(await parseDocumentDetailed(
      buffer,
      candidateDocument.mimeType,
      { abortSignal, timeoutMs: DEFAULT_DOCUMENT_PARSE_TIMEOUT_MS },
    ))
  } catch (error) {
    const parseError = error instanceof DocumentParseError
      ? error
      : new DocumentParseError('parser_runtime_error', true, error)
    persistence = parseFailurePersistence(parseError, false)
    if (parseError.retryable) {
      await enqueueProcessingTask({
        organizationId: task.organizationId,
        type: 'document_parse',
        resourceId: candidateDocument.id,
      })
    }
  }
  const completed = await completeDocumentTaskAfterFollowOn(
    persistence.parseStatus,
    () => maybeEnqueueAutomaticAnalysis(
      task.organizationId,
      candidateDocument.applicationId,
      {
        id: candidateDocument.id,
        uploadStatus: 'completed',
        parseStatus: 'parsed',
      },
    ),
    () => completeProcessingTaskWithDomainWrite({
      organizationId: task.organizationId,
      taskId: task.id,
      expectedAttemptCount: task.attemptCount,
      resultCode: 'upload_reconciled',
    }, async (executor) => {
      await executor.update(document)
        .set({ ...persistence, uploadStatus: 'completed' })
        .where(and(
          eq(document.id, candidateDocument.id),
          eq(document.organizationId, task.organizationId),
          eq(document.uploadStatus, 'pending'),
        ))
    }),
  )
  if (!completed) throw staleLeaseError()
}

export async function processClaimedRecruitingTask(
  task: ProcessingTaskRecord,
  abortSignal: AbortSignal,
): Promise<void> {
  switch (task.type) {
    case 'application_analysis':
      return processApplicationAnalysisTask(task, abortSignal)
    case 'document_parse':
      return processDocumentParseTask(task, abortSignal)
    case 'document_upload_reconciliation':
      return processUploadReconciliationTask(task, abortSignal)
  }
}
