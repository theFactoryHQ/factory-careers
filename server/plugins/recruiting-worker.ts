import { env } from '../utils/env'
import { logError } from '../utils/logger'
import {
  processRecruitingTasks,
  RECRUITING_TASK_TYPES,
  type ProcessRecruitingTasksInput,
} from '../utils/processRecruitingTasks'
import {
  findRunnableProcessingOrganizationIds,
  type ProcessingTaskType,
} from '../utils/processingQueue'

const DEFAULT_INTERVAL_MS = 5_000
const ORGANIZATION_PAGE_SIZE = 50

type WorkerTimer = {
  unref?: () => unknown
}

export type RecruitingWorkerDependencies = {
  listOrganizationIds(input: {
    afterOrganizationId?: string
    limit: number
    types: ProcessingTaskType[]
  }): Promise<string[]>
  processOrganization(input: Pick<
    ProcessRecruitingTasksInput,
    'organizationId' | 'types' | 'abortSignal'
  >): Promise<unknown>
  logError(body: string, attributes: {
    result_code: string
  }): void
  scheduleRepeating(callback: () => void, intervalMs: number): WorkerTimer
  clearRepeating(timer: WorkerTimer): void
}

export type RecruitingWorkerStartContext = {
  enabled: boolean
  test: boolean
  prerender: boolean
}

export function shouldStartRecruitingWorker(context: RecruitingWorkerStartContext): boolean {
  return context.enabled && !context.test && !context.prerender
}

export function startRecruitingWorker(
  dependencies: RecruitingWorkerDependencies,
  intervalMs = DEFAULT_INTERVAL_MS,
): { close: () => Promise<void> } {
  const controller = new AbortController()
  let afterOrganizationId: string | undefined
  let inFlight: Promise<void> | undefined
  let stopped = false

  async function runCycle(): Promise<void> {
    const organizationIds = await dependencies.listOrganizationIds({
      afterOrganizationId,
      limit: ORGANIZATION_PAGE_SIZE,
      types: [...RECRUITING_TASK_TYPES],
    })

    if (controller.signal.aborted) return

    afterOrganizationId = organizationIds.length === ORGANIZATION_PAGE_SIZE
      ? organizationIds.at(-1)
      : undefined

    for (const organizationId of organizationIds) {
      if (controller.signal.aborted) return

      try {
        await dependencies.processOrganization({
          organizationId,
          types: [...RECRUITING_TASK_TYPES],
          abortSignal: controller.signal,
        })
      }
      catch {
        if (controller.signal.aborted) return
        dependencies.logError('recruiting_worker.organization_failed', {
          result_code: 'processing_cycle_failed',
        })
      }
    }
  }

  function launchCycle(): void {
    if (stopped || inFlight) return

    const cycle = runCycle().catch(() => {
      if (controller.signal.aborted) return
      dependencies.logError('recruiting_worker.discovery_failed', {
        result_code: 'organization_discovery_failed',
      })
    })
    inFlight = cycle
    void cycle.then(() => {
      if (inFlight === cycle) inFlight = undefined
    })
  }

  const timer = dependencies.scheduleRepeating(launchCycle, intervalMs)
  timer.unref?.()
  launchCycle()

  return {
    async close() {
      if (stopped) {
        await inFlight
        return
      }

      stopped = true
      dependencies.clearRepeating(timer)
      controller.abort()
      await inFlight
    },
  }
}

export default defineNitroPlugin((nitroApp) => {
  if (!shouldStartRecruitingWorker({
    enabled: env.RECRUITING_WORKER_ENABLED,
    test: env.NODE_ENV === 'test',
    prerender: import.meta.prerender === true,
  })) return

  const worker = startRecruitingWorker({
    listOrganizationIds: findRunnableProcessingOrganizationIds,
    processOrganization: processRecruitingTasks,
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
