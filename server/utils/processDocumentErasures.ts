import type { DocumentErasureQueueRecord } from './documentErasureQueue'
import {
  claimDocumentErasures,
  completeDocumentErasure,
  getDocumentErasureResultCode,
  isMissingDocumentObject,
  recordDocumentErasureFailure,
} from './documentErasureQueue'
import { db } from './db'
import { reconcilePrivacyRequestErasureCompletionInTransaction } from './privacyRequests'
import { deleteFromS3 } from './s3'

type TransitionExecutor = Parameters<typeof reconcilePrivacyRequestErasureCompletionInTransaction>[0]
type CompletionInput = Parameters<typeof completeDocumentErasure>[1]
type FailureInput = Parameters<typeof recordDocumentErasureFailure>[1]

export type DocumentErasureProcessorDependencies = {
  claimTasks(input: { limit?: number }): Promise<DocumentErasureQueueRecord[]>
  deleteObject(storageKey: string, options: { abortSignal?: AbortSignal }): Promise<void>
  transaction<T>(operation: (executor: TransitionExecutor) => Promise<T>): Promise<T>
  completeTask(executor: TransitionExecutor, input: CompletionInput): Promise<boolean>
  reconcilePrivacy(
    executor: TransitionExecutor,
    input: { privacyRequestId: string; now?: Date },
  ): Promise<unknown>
  failTask(input: FailureInput): Promise<boolean>
  logFailure(input: { resultCode: string; retryable: boolean }): void
}

const defaultDependencies: DocumentErasureProcessorDependencies = {
  claimTasks: input => claimDocumentErasures(db, input),
  deleteObject: deleteFromS3,
  transaction: operation => db.transaction(operation),
  completeTask: completeDocumentErasure,
  reconcilePrivacy: reconcilePrivacyRequestErasureCompletionInTransaction,
  failTask: input => recordDocumentErasureFailure(db, input),
  logFailure(input) {
    logError('document_erasure.task_failed', {
      result_code: input.resultCode,
      retryable: input.retryable,
    })
  },
}

export async function processDocumentErasureCycle(
  input: { limit?: number; abortSignal?: AbortSignal } = {},
  dependencies: DocumentErasureProcessorDependencies = defaultDependencies,
): Promise<{ claimed: number; succeeded: number; retried: number; failed: number }> {
  const tasks = await dependencies.claimTasks({ limit: input.limit })
  const settled = await Promise.allSettled(tasks.map(async (task) => {
    let resultCode = 'erased'
    try {
      await dependencies.deleteObject(task.storageKey, { abortSignal: input.abortSignal })
    }
    catch (error) {
      if (isMissingDocumentObject(error)) {
        resultCode = 'object_absent'
      }
      else {
        resultCode = getDocumentErasureResultCode(error)
        const retryable = task.attemptCount < task.maxAttempts
        const transitioned = await dependencies.failTask({
          id: task.id,
          attemptCount: task.attemptCount,
          maxAttempts: task.maxAttempts,
          resultCode,
        })
        if (transitioned) dependencies.logFailure({ resultCode, retryable })
        return transitioned ? (retryable ? 'retried' : 'failed') : 'stale'
      }
    }

    const completed = await dependencies.transaction(async (executor) => {
      const transitioned = await dependencies.completeTask(executor, {
        id: task.id,
        attemptCount: task.attemptCount,
        resultCode,
      })
      if (transitioned && task.privacyRequestId) {
        await dependencies.reconcilePrivacy(executor, {
          privacyRequestId: task.privacyRequestId,
        })
      }
      return transitioned
    })
    return completed ? 'succeeded' : 'stale'
  }))
  const rejected = settled.find(result => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  const outcomes = settled.map(result => result.status === 'fulfilled' ? result.value : 'stale')

  return {
    claimed: tasks.length,
    succeeded: outcomes.filter(outcome => outcome === 'succeeded').length,
    retried: outcomes.filter(outcome => outcome === 'retried').length,
    failed: outcomes.filter(outcome => outcome === 'failed').length,
  }
}
