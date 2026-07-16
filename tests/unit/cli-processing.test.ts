import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  executeProcessingBatch,
  parseProcessingBatchResponse,
  pollProcessingBatch,
} from '../../packages/careers-cli/src/processing'

const completedBatch = {
  batchId: 'batch_1',
  type: 'document_parse',
  status: 'completed',
  counts: {
    pending: 0,
    processing: 0,
    succeeded: 1,
    failed: 0,
    cancelled: 0,
    attempted: 1,
    total: 1,
  },
  errorsByCode: {},
  createdAt: '2026-07-16T12:00:00.000Z',
  startedAt: '2026-07-16T12:00:01.000Z',
  completedAt: '2026-07-16T12:00:02.000Z',
  retryAfterMs: null,
} as const

describe('CLI processing batches', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it('strictly validates the sanitized response contract', () => {
    expect(parseProcessingBatchResponse(completedBatch)).toEqual(completedBatch)
    expect(() => parseProcessingBatchResponse({ ...completedBatch, secret: 'nope' }))
      .toThrow('Invalid processing batch response')
    expect(() => parseProcessingBatchResponse({
      ...completedBatch,
      counts: { ...completedBatch.counts, total: -1 },
    })).toThrow('Invalid processing batch response')
  })

  it('drains until terminal and honors the bounded server retry delay', async () => {
    const pending = {
      ...completedBatch,
      status: 'pending' as const,
      counts: { ...completedBatch.counts, pending: 1, succeeded: 0, attempted: 0 },
      completedAt: null,
      retryAfterMs: 90_000,
    }
    const drain = vi.fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(completedBatch)
    const sleep = vi.fn(async () => {})

    const result = await pollProcessingBatch(pending, {
      drain,
      sleep,
      timeoutMs: 120_000,
      pollIntervalMs: 500,
      now: (() => {
        let value = 0
        return () => (value += 1_000)
      })(),
    })

    expect(result).toEqual(completedBatch)
    expect(sleep).toHaveBeenCalledWith(30_000)
    expect(drain).toHaveBeenCalledTimes(2)
  })

  it.each(['failed', 'cancelled'] as const)('returns the %s terminal response to the command layer', async (status) => {
    const terminal = {
      ...completedBatch,
      status,
      counts: {
        ...completedBatch.counts,
        succeeded: 0,
        failed: status === 'failed' ? 1 : 0,
        cancelled: status === 'cancelled' ? 1 : 0,
      },
    }

    await expect(pollProcessingBatch(terminal, {
      drain: vi.fn(),
      sleep: vi.fn(),
      timeoutMs: 1_000,
      pollIntervalMs: 250,
    })).resolves.toEqual(terminal)
  })

  it('fails with a resumable batch ID at the finite timeout', async () => {
    const pending = {
      ...completedBatch,
      status: 'pending' as const,
      counts: { ...completedBatch.counts, pending: 1, succeeded: 0, attempted: 0 },
      completedAt: null,
      retryAfterMs: 1_000,
    }
    const now = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(2_000)

    await expect(pollProcessingBatch(pending, {
      drain: vi.fn(),
      sleep: vi.fn(),
      timeoutMs: 1_000,
      pollIntervalMs: 250,
      now,
    })).rejects.toMatchObject({
      code: 'PROCESSING_TIMEOUT',
      details: { batchId: 'batch_1' },
    })
  })

  it('does not leave a retry sleep running beyond the remaining timeout', async () => {
    const pending = {
      ...completedBatch,
      status: 'pending' as const,
      counts: { ...completedBatch.counts, pending: 1, succeeded: 0, attempted: 0 },
      completedAt: null,
      retryAfterMs: 30_000,
    }
    const sleep = vi.fn(async () => {})
    const now = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(800)
      .mockReturnValueOnce(1_000)

    await expect(pollProcessingBatch(pending, {
      drain: vi.fn(async () => pending),
      sleep,
      timeoutMs: 1_000,
      pollIntervalMs: 250,
      now,
    })).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' })

    expect(sleep).toHaveBeenCalledOnce()
    expect(sleep).toHaveBeenCalledWith(200)
  })

  it('times out even when a drain request ignores its abort signal', async () => {
    vi.useFakeTimers()
    const pending = {
      ...completedBatch,
      status: 'pending' as const,
      counts: { ...completedBatch.counts, pending: 1, succeeded: 0, attempted: 0 },
      completedAt: null,
      retryAfterMs: 1_000,
    }
    const running = pollProcessingBatch(pending, {
      drain: vi.fn(() => new Promise(() => {})),
      sleep: vi.fn(),
      timeoutMs: 1_000,
      pollIntervalMs: 250,
    })
    const rejection = expect(running).rejects.toMatchObject({
      code: 'PROCESSING_TIMEOUT',
      details: { batchId: 'batch_1' },
    })

    await vi.advanceTimersByTimeAsync(1_000)
    await rejection
  })

  it('shares one timeout budget across batch creation and draining', async () => {
    vi.useFakeTimers()
    const pending = {
      ...completedBatch,
      status: 'pending' as const,
      counts: { ...completedBatch.counts, pending: 1, succeeded: 0, attempted: 0 },
      completedAt: null,
      retryAfterMs: 1_000,
    }
    let drainSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      drainSignal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    })
    const running = executeProcessingBatch(
      async () => await new Promise(resolve => setTimeout(() => resolve(pending), 600)),
      {
        fetch: fetchMock as typeof fetch,
        baseUrl: 'https://careers.example.com',
        token: 'secret-token',
        sleep: vi.fn(async () => {}),
        options: { wait: true, timeoutMs: 1_000, pollIntervalMs: 250 },
      },
    )
    const rejection = expect(running).rejects.toMatchObject({
      code: 'PROCESSING_TIMEOUT',
      details: { batchId: 'batch_1' },
    })

    await vi.advanceTimersByTimeAsync(600)
    expect(fetchMock).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(400)
    await rejection

    expect(drainSignal?.aborted).toBe(true)
  })
})
