import { env } from '../utils/env'
import { logError } from '../utils/logger'
import { processDocumentErasureCycle } from '../utils/processDocumentErasures'

const DEFAULT_INTERVAL_MS = 5_000
type WorkerTimer = { unref?: () => unknown }

export type DocumentErasureWorkerDependencies = {
  processCycle(input: { abortSignal: AbortSignal }): Promise<unknown>
  logError(body: string, attributes: { result_code: string }): void
  scheduleRepeating(callback: () => void, intervalMs: number): WorkerTimer
  clearRepeating(timer: WorkerTimer): void
}

export function shouldStartDocumentErasureWorker(input: {
  enabled: boolean
  test: boolean
  prerender: boolean
}): boolean {
  return input.enabled && !input.test && !input.prerender
}

export function startDocumentErasureWorker(
  dependencies: DocumentErasureWorkerDependencies,
  intervalMs = DEFAULT_INTERVAL_MS,
): { close: () => Promise<void> } {
  const controller = new AbortController()
  let inFlight: Promise<void> | undefined
  let stopped = false

  function launch(): void {
    if (stopped || inFlight) return
    const cycle = dependencies.processCycle({ abortSignal: controller.signal })
      .then(() => undefined)
      .catch(() => {
        if (controller.signal.aborted) return
        dependencies.logError('document_erasure_worker.cycle_failed', {
          result_code: 'document_erasure_cycle_failed',
        })
      })
    inFlight = cycle
    void cycle.finally(() => {
      if (inFlight === cycle) inFlight = undefined
    })
  }

  const timer = dependencies.scheduleRepeating(launch, intervalMs)
  timer.unref?.()
  launch()

  return {
    async close() {
      stopped = true
      dependencies.clearRepeating(timer)
      controller.abort()
      await inFlight
    },
  }
}

export default defineNitroPlugin((nitroApp) => {
  if (!shouldStartDocumentErasureWorker({
    enabled: env.DOCUMENT_ERASURE_WORKER_ENABLED,
    test: env.NODE_ENV === 'test',
    prerender: import.meta.prerender === true,
  })) return

  const worker = startDocumentErasureWorker({
    processCycle: processDocumentErasureCycle,
    logError,
    scheduleRepeating(callback, intervalMs) {
      return setInterval(callback, intervalMs)
    },
    clearRepeating(timer) {
      clearInterval(timer as ReturnType<typeof setInterval>)
    },
  })
  nitroApp.hooks.hookOnce('close', () => worker.close())
})
