import { beforeAll, describe, expect, it, vi } from 'vitest'

type WorkerModule = typeof import('../../server/plugins/candidate-workflow-email-worker')

let startCandidateWorkflowEmailWorker: WorkerModule['startCandidateWorkflowEmailWorker']
let shouldStartCandidateWorkflowEmailWorker: WorkerModule['shouldStartCandidateWorkflowEmailWorker']

beforeAll(async () => {
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  ;({
    startCandidateWorkflowEmailWorker,
    shouldStartCandidateWorkflowEmailWorker,
  } = await import('../../server/plugins/candidate-workflow-email-worker'))
})

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('candidate workflow email worker lifecycle', () => {
  it.each([
    { enabled: false, test: false, prerender: false },
    { enabled: true, test: true, prerender: false },
    { enabled: true, test: false, prerender: true },
  ])('does not start when disabled or during tests/build-time prerendering: %o', (input) => {
    expect(shouldStartCandidateWorkflowEmailWorker(input)).toBe(false)
  })

  it('runs immediately, prevents overlapping cycles, and waits for shutdown', async () => {
    let scheduledTick!: () => void
    let finish!: () => void
    const cycle = new Promise<void>((resolve) => {
      finish = resolve
    })
    const processCycle = vi.fn().mockReturnValueOnce(cycle).mockResolvedValue(undefined)
    const clearRepeating = vi.fn()
    const unref = vi.fn()

    const worker = startCandidateWorkflowEmailWorker({
      processCycle,
      logError: vi.fn(),
      scheduleRepeating(callback) {
        scheduledTick = callback
        return { unref }
      },
      clearRepeating,
    })

    await flushPromises()
    scheduledTick()
    await flushPromises()
    expect(processCycle).toHaveBeenCalledOnce()
    expect(unref).toHaveBeenCalledOnce()

    const close = worker.close()
    expect(clearRepeating).toHaveBeenCalledOnce()
    finish()
    await close
  })
})
