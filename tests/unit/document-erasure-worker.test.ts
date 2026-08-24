import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { DocumentErasureQueueRecord } from '../../server/utils/documentErasureQueue'
import { envSchema } from '../../server/utils/env'

type ProcessorModule = typeof import('../../server/utils/processDocumentErasures')
type WorkerModule = typeof import('../../server/plugins/document-erasure-worker')

let processDocumentErasureCycle: ProcessorModule['processDocumentErasureCycle']
let startDocumentErasureWorker: WorkerModule['startDocumentErasureWorker']
let shouldStartDocumentErasureWorker: WorkerModule['shouldStartDocumentErasureWorker']

beforeAll(async () => {
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  ;({ processDocumentErasureCycle } = await import('../../server/utils/processDocumentErasures'))
  ;({ startDocumentErasureWorker, shouldStartDocumentErasureWorker }
    = await import('../../server/plugins/document-erasure-worker'))
})

function task(overrides: Partial<DocumentErasureQueueRecord> = {}): DocumentErasureQueueRecord {
  return {
    id: 'queue-1',
    organizationId: null,
    privacyRequestId: 'privacy-1',
    storageKey: 'private/document.pdf',
    dedupeKey: 'document-erasure:opaque',
    status: 'processing',
    attemptCount: 1,
    maxAttempts: 3,
    availableAt: new Date('2026-08-23T12:00:00Z'),
    leaseExpiresAt: new Date('2026-08-23T12:10:00Z'),
    resultCode: null,
    createdAt: new Date('2026-08-23T11:00:00Z'),
    updatedAt: new Date('2026-08-23T12:00:00Z'),
    completedAt: null,
    ...overrides,
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('document erasure processing cycle', () => {
  it('completes confirmed and missing objects and reconciles privacy in the completion transaction', async () => {
    const transactionEvents: string[] = []
    let transactionNumber = 0
    const records = [task(), task({ id: 'queue-2', storageKey: 'private/missing.pdf', privacyRequestId: 'privacy-2' })]
    const result = await processDocumentErasureCycle({}, {
      claimTasks: vi.fn(async () => records),
      deleteObject: vi.fn(async (storageKey) => {
        if (storageKey.endsWith('missing.pdf')) throw Object.assign(new Error('private provider detail'), { name: 'NoSuchKey' })
      }),
      transaction: async (operation) => {
        const executor = { transactionId: ++transactionNumber }
        transactionEvents.push(`begin:${executor.transactionId}`)
        const value = await operation(executor as never)
        transactionEvents.push(`commit:${executor.transactionId}`)
        return value
      },
      completeTask: vi.fn(async (executor, input) => {
        transactionEvents.push(`complete:${(executor as unknown as { transactionId: number }).transactionId}:${input.resultCode}`)
        return true
      }),
      reconcilePrivacy: vi.fn(async (executor, input) => {
        transactionEvents.push(`privacy:${(executor as unknown as { transactionId: number }).transactionId}:${input.privacyRequestId}`)
      }),
      failTask: vi.fn(),
      logFailure: vi.fn(),
    })

    expect(result).toEqual({ claimed: 2, succeeded: 2, retried: 0, failed: 0 })
    expect(transactionEvents.filter(event => event.includes(':1'))).toEqual([
      'begin:1', 'complete:1:erased', 'privacy:1:privacy-1', 'commit:1',
    ])
    expect(transactionEvents.filter(event => event.includes(':2'))).toEqual([
      'begin:2', 'complete:2:object_absent', 'privacy:2:privacy-2', 'commit:2',
    ])
  })

  it('retries transient failures, makes exhausted failures terminal, and logs sanitized codes only', async () => {
    const logFailure = vi.fn()
    const result = await processDocumentErasureCycle({}, {
      claimTasks: vi.fn(async () => [
        task({ id: 'retry', attemptCount: 1, maxAttempts: 3 }),
        task({ id: 'terminal', attemptCount: 3, maxAttempts: 3 }),
      ]),
      deleteObject: vi.fn(async () => {
        throw Object.assign(new Error('candidate@example.invalid private/key'), { name: 'ProviderTimeoutError' })
      }),
      transaction: async operation => operation({} as never),
      completeTask: vi.fn(),
      reconcilePrivacy: vi.fn(),
      failTask: vi.fn(async () => true),
      logFailure,
    })

    expect(result).toEqual({ claimed: 2, succeeded: 0, retried: 1, failed: 1 })
    expect(logFailure).toHaveBeenCalledTimes(2)
    expect(logFailure.mock.calls).toEqual([
      [{ resultCode: 'storage_timeout', retryable: true }],
      [{ resultCode: 'storage_timeout', retryable: false }],
    ])
    expect(JSON.stringify(logFailure.mock.calls)).not.toContain('candidate@example.invalid')
    expect(JSON.stringify(logFailure.mock.calls)).not.toContain('private/key')
  })

  it('waits for every claimed operation to settle before surfacing a cycle failure', async () => {
    const releaseSecond = deferred()
    const processing = processDocumentErasureCycle({}, {
      claimTasks: vi.fn(async () => [task(), task({ id: 'queue-2', storageKey: 'private/second.pdf' })]),
      deleteObject: vi.fn(async (storageKey) => {
        if (storageKey.endsWith('second.pdf')) await releaseSecond.promise
      }),
      transaction: async operation => operation({} as never),
      completeTask: vi.fn(async () => true),
      reconcilePrivacy: vi.fn(async (_executor, input) => {
        if (input.privacyRequestId === 'privacy-1') throw new Error('reconciliation failed')
      }),
      failTask: vi.fn(),
      logFailure: vi.fn(),
    })
    let rejected = false
    void processing.catch(() => { rejected = true })

    await new Promise(resolve => setImmediate(resolve))
    expect(rejected).toBe(false)
    releaseSecond.resolve()
    await expect(processing).rejects.toThrow('reconciliation failed')
  })
})

describe('document erasure worker lifecycle', () => {
  it('defaults the runtime worker flag off and accepts explicit enablement', () => {
    const baseEnv = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      BETTER_AUTH_URL: 'https://app.example.com',
      S3_ENDPOINT: 'https://s3.example.com',
      S3_ACCESS_KEY: 'test-key',
      S3_SECRET_KEY: 'test-secret',
      S3_BUCKET: 'test-bucket',
    }
    const disabled = envSchema.parse(baseEnv)
    const enabled = envSchema.parse({ ...baseEnv, DOCUMENT_ERASURE_WORKER_ENABLED: 'true' })

    expect(disabled.DOCUMENT_ERASURE_WORKER_ENABLED).toBe(false)
    expect(enabled.DOCUMENT_ERASURE_WORKER_ENABLED).toBe(true)
  })

  it.each([
    { enabled: false, test: false, prerender: false },
    { enabled: true, test: true, prerender: false },
    { enabled: true, test: false, prerender: true },
  ])('does not start when disabled or during tests/build-time prerendering: %o', (context) => {
    expect(shouldStartDocumentErasureWorker(context)).toBe(false)
  })

  it('starts only when explicitly enabled at runtime', () => {
    expect(shouldStartDocumentErasureWorker({ enabled: true, test: false, prerender: false })).toBe(true)
  })

  it('runs immediately without overlap and aborts and awaits the active cycle on shutdown', async () => {
    let scheduledTick!: () => void
    let activeSignal: AbortSignal | undefined
    const release = deferred()
    const clearRepeating = vi.fn()
    const processCycle = vi.fn(async ({ abortSignal }: { abortSignal: AbortSignal }) => {
      activeSignal = abortSignal
      await release.promise
    })
    const worker = startDocumentErasureWorker({
      processCycle,
      logError: vi.fn(),
      scheduleRepeating(callback) {
        scheduledTick = callback
        return { unref: vi.fn() }
      },
      clearRepeating,
    })

    await flushPromises()
    scheduledTick()
    scheduledTick()
    await flushPromises()
    expect(processCycle).toHaveBeenCalledOnce()

    const close = worker.close()
    expect(clearRepeating).toHaveBeenCalledOnce()
    expect(activeSignal?.aborted).toBe(true)
    let closed = false
    void close.then(() => { closed = true })
    await flushPromises()
    expect(closed).toBe(false)

    release.resolve()
    await close
    expect(closed).toBe(true)
  })

  it('logs only a fixed cycle code when processing rejects', async () => {
    const logError = vi.fn()
    const worker = startDocumentErasureWorker({
      processCycle: vi.fn(async () => { throw new Error('candidate@example.invalid private/key') }),
      logError,
      scheduleRepeating: () => ({ unref: vi.fn() }),
      clearRepeating: vi.fn(),
    })
    await flushPromises()
    expect(logError).toHaveBeenCalledWith('document_erasure_worker.cycle_failed', {
      result_code: 'document_erasure_cycle_failed',
    })
    expect(JSON.stringify(logError.mock.calls)).not.toContain('candidate@example.invalid')
    await worker.close()
  })
})
