import { env } from '../utils/env'
import { logError } from '../utils/logger'
import { processCandidateWorkflowEmailCycle } from '../utils/candidateWorkflowEmailQueue'

const DEFAULT_INTERVAL_MS = 5_000

type WorkerTimer = { unref?: () => unknown }

export type CandidateWorkflowEmailWorkerDependencies = {
  processCycle(): Promise<void>
  logError(body: string, attributes: { result_code: string }): void
  scheduleRepeating(callback: () => void, intervalMs: number): WorkerTimer
  clearRepeating(timer: WorkerTimer): void
}

export function shouldStartCandidateWorkflowEmailWorker(input: {
  enabled: boolean
  test: boolean
  prerender: boolean
}): boolean {
  return input.enabled && !input.test && !input.prerender
}

export function startCandidateWorkflowEmailWorker(
  dependencies: CandidateWorkflowEmailWorkerDependencies,
  intervalMs = DEFAULT_INTERVAL_MS,
): { close: () => Promise<void> } {
  let inFlight: Promise<void> | undefined
  let stopped = false

  function launch(): void {
    if (stopped || inFlight) return
    const cycle = dependencies.processCycle().catch(() => {
      dependencies.logError('candidate_workflow_email_worker.cycle_failed', {
        result_code: 'candidate_workflow_email_cycle_failed',
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
      await inFlight
    },
  }
}

export default defineNitroPlugin((nitroApp) => {
  if (!shouldStartCandidateWorkflowEmailWorker({
    enabled: env.APPLICATION_NOTIFICATION_WORKER_ENABLED,
    test: env.NODE_ENV === 'test',
    prerender: import.meta.prerender === true,
  })) return

  const worker = startCandidateWorkflowEmailWorker({
    processCycle: processCandidateWorkflowEmailCycle,
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
