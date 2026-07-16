import { computed, onScopeDispose, shallowRef } from 'vue'
import {
  isProcessingBatchTerminal,
  type ProcessingBatchResponse,
} from '~~/shared/processing-batch'

export type { ProcessingBatchResponse } from '~~/shared/processing-batch'

type DriveProcessingBatchOptions = {
  drain: (batchId: string, signal?: AbortSignal) => Promise<ProcessingBatchResponse>
  sleep?: (ms: number) => Promise<void>
  signal?: AbortSignal
  onUpdate?: (batch: ProcessingBatchResponse) => void
}

const MIN_BROWSER_RETRY_MS = 250
const MAX_BROWSER_RETRY_MS = 30_000
const DEFAULT_BROWSER_RETRY_MS = 1_000

function abortError(): DOMException {
  return new DOMException('Processing batch observation was stopped', 'AbortError')
}

export function isProcessingObservationAbort(error: unknown): boolean {
  const seen = new Set<object>()
  let current = error

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const candidate = current as { name?: unknown, cause?: unknown }
    if (candidate.name === 'AbortError') return true
    current = candidate.cause
  }

  return false
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

async function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal)
  if (!signal) return promise

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function browserRetryDelay(retryAfterMs: number | null): number {
  return Math.min(
    MAX_BROWSER_RETRY_MS,
    Math.max(MIN_BROWSER_RETRY_MS, retryAfterMs ?? DEFAULT_BROWSER_RETRY_MS),
  )
}

export async function driveProcessingBatch(
  initial: ProcessingBatchResponse,
  options: DriveProcessingBatchOptions,
): Promise<ProcessingBatchResponse> {
  let current = initial
  const sleep = options.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)))

  while (!isProcessingBatchTerminal(current.status)) {
    throwIfAborted(options.signal)
    const next = await abortable(options.drain(current.batchId, options.signal), options.signal)
    if (next.batchId !== initial.batchId) {
      throw new Error('Processing batch response did not match the active batch')
    }
    current = next
    options.onUpdate?.(current)
    if (!isProcessingBatchTerminal(current.status)) {
      await abortable(sleep(browserRetryDelay(current.retryAfterMs)), options.signal)
    }
  }

  return current
}

type CreateAndDrainProcessingBatchOptions = {
  path: string
  body?: Record<string, unknown>
  onCreated?: (batch: ProcessingBatchResponse) => void
}

export function useProcessingBatch() {
  const batch = shallowRef<ProcessingBatchResponse | null>(null)
  const isRunning = computed(() => batch.value !== null && !isProcessingBatchTerminal(batch.value.status))
  let activeController: AbortController | null = null
  let activeRun = 0
  const headers = useRequestHeaders(['cookie'])

  function stop(): void {
    activeRun++
    activeController?.abort()
    activeController = null
  }

  function reset(): void {
    stop()
    batch.value = null
  }

  async function createAndDrain(
    options: CreateAndDrainProcessingBatchOptions,
  ): Promise<ProcessingBatchResponse> {
    stop()
    batch.value = null
    const run = activeRun
    const controller = new AbortController()
    activeController = controller

    try {
      const initial = await $fetch<ProcessingBatchResponse>(options.path, {
        method: 'POST',
        headers,
        body: options.body,
        signal: controller.signal,
      })
      if (run !== activeRun || controller.signal.aborted) throw abortError()
      batch.value = initial
      options.onCreated?.(initial)

      return await driveProcessingBatch(initial, {
        signal: controller.signal,
        drain: async (batchId, signal) => await $fetch<ProcessingBatchResponse>(
          `/api/processing/${encodeURIComponent(batchId)}/drain`,
          {
            method: 'POST',
            headers,
            body: { limit: 5 },
            signal,
          },
        ),
        onUpdate: (next) => {
          if (run === activeRun) batch.value = next
        },
      })
    }
    catch (error) {
      if (run !== activeRun || controller.signal.aborted) throw abortError()
      throw error
    }
    finally {
      if (run === activeRun) activeController = null
    }
  }

  onScopeDispose(stop)

  return {
    batch,
    isRunning,
    createAndDrain,
    stop,
    reset,
  }
}
