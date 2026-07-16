import { describe, expect, it, vi } from 'vitest'
import type { ProcessingTaskRecord } from '../../server/utils/processingQueue'
import { AnalyzeApplicationError } from '../../server/utils/analyzeApplication'
import { DocumentParseError } from '../../server/utils/resume-parser'
import {
  analysisTaskCompletionOutcome,
  classifyRecruitingTaskError,
  completeDocumentTaskAfterFollowOn,
  MAX_RECRUITING_TASK_CONCURRENCY,
  processRecruitingTasks,
  RECRUITING_TASK_TYPES,
  shouldEnqueueAutomaticAnalysis,
  withBoundedAbort,
} from '../../server/utils/processRecruitingTasks'

function task(id: string): ProcessingTaskRecord {
  return {
    id,
    organizationId: 'org-1',
    type: 'application_analysis',
    resourceId: `application-${id}`,
    status: 'processing',
    attemptCount: 1,
    maxAttempts: 5,
    availableAt: new Date('2026-07-16T12:00:00.000Z'),
    leaseExpiresAt: new Date('2026-07-16T12:05:00.000Z'),
    resultCode: null,
    createdAt: new Date('2026-07-16T12:00:00.000Z'),
    updatedAt: new Date('2026-07-16T12:00:00.000Z'),
    completedAt: null,
  }
}

describe('durable recruiting task processor', () => {
  it('processes every supported task type', () => {
    expect(RECRUITING_TASK_TYPES).toEqual([
      'application_analysis',
      'document_parse',
      'document_upload_reconciliation',
    ])
  })

  it('classifies expected failures into stable codes without raw messages', () => {
    expect(classifyRecruitingTaskError(
      new DocumentParseError('parser_timeout', true, new Error('private parser detail')),
    )).toEqual({ resultCode: 'parser_timeout', retryable: true })
    expect(classifyRecruitingTaskError(
      new AnalyzeApplicationError('MISSING_CRITERIA', 'private rubric detail'),
    )).toEqual({ resultCode: 'missing_criteria', retryable: false })
    expect(classifyRecruitingTaskError(new Error('secret provider response'))).toEqual({
      resultCode: 'processing_failed',
      retryable: true,
    })
    expect(classifyRecruitingTaskError(new AnalyzeApplicationError(
      'PROVIDER_FAILURE',
      'stable',
      { retryable: false },
    ))).toEqual({ resultCode: 'provider_failure', retryable: false })
    expect(classifyRecruitingTaskError(new AnalyzeApplicationError(
      'PROVIDER_FAILURE',
      'stable',
      { retryable: true },
    ))).toEqual({ resultCode: 'provider_failure', retryable: true })
  })

  it('marks a persistence-race skip as already scored', () => {
    expect(analysisTaskCompletionOutcome(null)).toEqual({
      result: null,
      resultCode: 'already_scored',
    })
    expect(analysisTaskCompletionOutcome({ id: 'analysis-run-1' })).toEqual({
      result: { id: 'analysis-run-1' },
      resultCode: 'analysis_completed',
    })
  })

  it('isolates task failures and keeps processing the remaining bounded claims', async () => {
    const claimed = [task('one'), task('two')]
    const processTask = vi.fn(async (current: ProcessingTaskRecord) => {
      if (current.id === 'one') throw new Error('private provider response')
    })
    const failTask = vi.fn(async () => task('one'))
    const renewLease = vi.fn(async () => task('one'))
    const logFailure = vi.fn()

    await expect(processRecruitingTasks({
      organizationId: 'org-1',
      batchId: 'batch-1',
      limit: 2,
    }, {
      claimTasks: vi.fn(async input => {
        expect(input).toMatchObject({ organizationId: 'org-1', batchId: 'batch-1', limit: 2 })
        return claimed
      }),
      processTask,
      failTask,
      renewLease,
      logFailure,
      heartbeatMs: 60_000,
    })).resolves.toEqual({ claimed: 2, succeeded: 1, failed: 1 })

    expect(processTask).toHaveBeenCalledTimes(2)
    expect(failTask).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'one',
      resultCode: 'processing_failed',
      retryable: true,
    }))
    expect(logFailure).toHaveBeenCalledWith({
      taskType: 'application_analysis',
      resultCode: 'processing_failed',
      retryable: true,
    })
    expect(JSON.stringify(logFailure.mock.calls)).not.toContain('private provider response')
  })

  it('starts every bounded claim even when the parent aborts immediately after claiming', async () => {
    const controller = new AbortController()
    const claimed = [task('one'), task('two')]
    const processTask = vi.fn(async (_task: ProcessingTaskRecord, signal: AbortSignal) => {
      expect(signal.aborted).toBe(true)
    })

    await processRecruitingTasks({
      organizationId: 'org-1',
      limit: 2,
      abortSignal: controller.signal,
    }, {
      claimTasks: vi.fn(async () => {
        controller.abort()
        return claimed
      }),
      processTask,
      failTask: vi.fn(),
      renewLease: vi.fn(),
      logFailure: vi.fn(),
      heartbeatMs: 60_000,
    })

    expect(processTask).toHaveBeenCalledTimes(2)
  })

  it('caps concurrent task execution even when a drain claims a larger page', async () => {
    let active = 0
    let peak = 0
    const claimed = Array.from({ length: 17 }, (_, index) => task(String(index)))
    const claimTasks = vi.fn(async () => claimed)

    await processRecruitingTasks({ organizationId: 'org-1', limit: claimed.length }, {
      claimTasks,
      processTask: vi.fn(async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 2))
        active -= 1
      }),
      failTask: vi.fn(),
      renewLease: vi.fn(),
      logFailure: vi.fn(),
      heartbeatMs: 60_000,
    })

    expect(peak).toBeLessThanOrEqual(MAX_RECRUITING_TASK_CONCURRENCY)
    expect(MAX_RECRUITING_TASK_CONCURRENCY).toBeLessThanOrEqual(10)
    expect(claimTasks).toHaveBeenCalledWith(expect.objectContaining({
      limit: MAX_RECRUITING_TASK_CONCURRENCY,
    }))
  })

  it('times out a dependency that ignores abort instead of awaiting it forever', async () => {
    const signal = new AbortController().signal
    await expect(withBoundedAbort(
      signal,
      5,
      'provider_timeout',
      async () => new Promise<never>(() => undefined),
    )).rejects.toMatchObject({ resultCode: 'provider_timeout', retryable: true })
  })

  it('stops awaiting a dependency that ignores a parent abort', async () => {
    const controller = new AbortController()
    const pending = withBoundedAbort(
      controller.signal,
      60_000,
      'provider_timeout',
      async () => new Promise<never>(() => undefined),
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not complete a parsed source task when its automatic-analysis enqueue fails', async () => {
    const enqueueFollowOn = vi.fn(async () => {
      throw new Error('queue unavailable')
    })
    const completeSourceTask = vi.fn(async () => 'completed')

    await expect(completeDocumentTaskAfterFollowOn(
      'parsed',
      enqueueFollowOn,
      completeSourceTask,
    )).rejects.toThrow('queue unavailable')
    expect(enqueueFollowOn).toHaveBeenCalledOnce()
    expect(completeSourceTask).not.toHaveBeenCalled()
  })

  it('treats zero as scored and projects the current parsed document before enqueueing', () => {
    const documents = [{
      id: 'resume-1',
      type: 'resume' as const,
      uploadStatus: 'pending' as const,
      parseStatus: 'pending' as const,
    }]
    const readyDocument = {
      id: 'resume-1',
      uploadStatus: 'completed' as const,
      parseStatus: 'parsed' as const,
    }

    expect(shouldEnqueueAutomaticAnalysis(
      { autoScoreOnApply: true, score: 0 },
      documents,
      readyDocument,
    )).toBe(false)
    expect(shouldEnqueueAutomaticAnalysis(
      { autoScoreOnApply: true, score: null },
      documents,
      readyDocument,
    )).toBe(true)
  })
})
