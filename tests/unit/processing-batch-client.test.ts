import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import {
  driveProcessingBatch,
  isProcessingObservationAbort,
  type ProcessingBatchResponse,
  useProcessingBatch,
} from '../../app/composables/useProcessingBatch'

function batch(
  status: ProcessingBatchResponse['status'],
  counts: Partial<ProcessingBatchResponse['counts']> = {},
): ProcessingBatchResponse {
  return {
    batchId: 'batch_1',
    type: 'application_analysis',
    status,
    counts: {
      pending: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      attempted: 0,
      total: 0,
      ...counts,
    },
    errorsByCode: {},
    createdAt: '2026-07-16T12:00:00.000Z',
    startedAt: status === 'pending' ? null : '2026-07-16T12:00:01.000Z',
    completedAt: ['completed', 'failed', 'cancelled'].includes(status)
      ? '2026-07-16T12:00:02.000Z'
      : null,
    retryAfterMs: ['completed', 'failed', 'cancelled'].includes(status) ? null : 2_500,
  }
}

describe('processing batch browser client', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns a zero-task batch without draining', async () => {
    const drain = vi.fn()
    const initial = batch('completed')

    await expect(driveProcessingBatch(initial, { drain })).resolves.toEqual(initial)
    expect(drain).not.toHaveBeenCalled()
  })

  it('publishes progress and returns a partial failure terminal batch', async () => {
    const progress = batch('processing', { processing: 1, succeeded: 1, attempted: 2, total: 3 })
    const failed = batch('failed', { succeeded: 2, failed: 1, attempted: 3, total: 3 })
    const updates: ProcessingBatchResponse[] = []
    const drain = vi.fn()
      .mockResolvedValueOnce(progress)
      .mockResolvedValueOnce(failed)
    const sleep = vi.fn(async () => {})

    const result = await driveProcessingBatch(
      batch('pending', { pending: 3, total: 3 }),
      { drain, sleep, onUpdate: value => updates.push(value) },
    )

    expect(result).toEqual(failed)
    expect(updates).toEqual([progress, failed])
    expect(sleep).toHaveBeenCalledWith(2_500)
  })

  it('aborts local waiting without cancelling the durable batch', async () => {
    const controller = new AbortController()
    const drain = vi.fn().mockResolvedValue(batch('pending', { pending: 1, total: 1 }))
    const sleep = vi.fn(() => new Promise<void>(() => {}))
    const running = driveProcessingBatch(
      batch('pending', { pending: 1, total: 1 }),
      { drain, sleep, signal: controller.signal },
    )

    await vi.waitFor(() => expect(drain).toHaveBeenCalledOnce())
    controller.abort()

    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
    expect(drain).toHaveBeenCalledOnce()
  })

  it('rejects a stale drain response for another batch', async () => {
    const drain = vi.fn().mockResolvedValue({
      ...batch('completed'),
      batchId: 'batch_stale',
    })

    await expect(driveProcessingBatch(batch('pending'), { drain }))
      .rejects.toThrow('Processing batch response did not match the active batch')
  })

  it('aborts browser work when its owning component scope is disposed', async () => {
    vi.stubGlobal('useRequestHeaders', vi.fn(() => ({ cookie: 'session' })))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(batch('pending', { pending: 1, total: 1 }))
      .mockImplementationOnce((_path: string, options: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }))
    vi.stubGlobal('$fetch', fetchMock)
    const scope = effectScope()
    const client = scope.run(() => useProcessingBatch())!
    const running = client.createAndDrain({ path: '/api/documents/doc_1/parse' })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    scope.stop()

    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/processing/batch_1/drain')
  })

  it('recognizes ofetch abort wrappers and normalizes an aborted initial request', async () => {
    const wrappedAbort = Object.assign(new Error('fetch failed'), {
      name: 'FetchError',
      cause: new DOMException('Aborted', 'AbortError'),
    })
    expect(isProcessingObservationAbort(wrappedAbort)).toBe(true)

    vi.stubGlobal('useRequestHeaders', vi.fn(() => ({ cookie: 'session' })))
    let rejectInitial!: (error: unknown) => void
    const fetchMock = vi.fn((_path: string, options: { signal?: AbortSignal }) => {
      options.signal?.addEventListener('abort', () => rejectInitial(wrappedAbort), { once: true })
      return new Promise<ProcessingBatchResponse>((_resolve, reject) => {
        rejectInitial = reject
      })
    })
    vi.stubGlobal('$fetch', fetchMock)
    const scope = effectScope()
    const client = scope.run(() => useProcessingBatch())!
    const running = client.createAndDrain({ path: '/api/documents/doc_1/parse' })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    client.stop()

    const rejection = await running.catch(error => error)
    expect(rejection).toMatchObject({ name: 'AbortError' })
    expect(isProcessingObservationAbort(rejection)).toBe(true)
    scope.stop()
  })

  it('clears terminal progress synchronously before creating a replacement batch', async () => {
    vi.stubGlobal('useRequestHeaders', vi.fn(() => ({})))
    let resolveReplacement!: (value: ProcessingBatchResponse) => void
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(batch('completed'))
      .mockImplementationOnce(() => new Promise<ProcessingBatchResponse>((resolve) => {
        resolveReplacement = resolve
      }))
    vi.stubGlobal('$fetch', fetchMock)
    const scope = effectScope()
    const client = scope.run(() => useProcessingBatch())!

    await client.createAndDrain({ path: '/api/first' })
    expect(client.batch.value?.status).toBe('completed')

    const replacement = client.createAndDrain({ path: '/api/second' })
    expect(client.batch.value).toBeNull()
    resolveReplacement(batch('completed'))
    await replacement
    scope.stop()
  })
})
