import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { envSchema } from '../../server/utils/env'

type RecruitingWorkerModule = typeof import('../../server/plugins/recruiting-worker')

let startRecruitingWorker: RecruitingWorkerModule['startRecruitingWorker']
let shouldStartRecruitingWorker: RecruitingWorkerModule['shouldStartRecruitingWorker']

beforeAll(async () => {
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  ;({ startRecruitingWorker, shouldStartRecruitingWorker }
    = await import('../../server/plugins/recruiting-worker'))
})

beforeEach(() => {
  vi.clearAllMocks()
})

function validEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    DATABASE_URL: 'postgresql://factory-careers.test/database',
    BETTER_AUTH_SECRET: 'a-secure-test-secret-that-is-at-least-32-characters',
    BETTER_AUTH_URL: 'https://careers.example.test',
    S3_ENDPOINT: 'https://storage.example.test',
    S3_ACCESS_KEY: 'access-key',
    S3_SECRET_KEY: 'secret-key',
    S3_BUCKET: 'documents',
    ...overrides,
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('recruiting worker environment contract', () => {
  it('defaults the worker to disabled and accepts an explicit true flag', () => {
    const disabled = envSchema.parse(validEnv())
    const enabled = envSchema.parse(validEnv({ RECRUITING_WORKER_ENABLED: 'true' }))

    expect(disabled.RECRUITING_WORKER_ENABLED).toBe(false)
    expect(enabled.RECRUITING_WORKER_ENABLED).toBe(true)
  })

  it.each([
    { enabled: false, test: false, prerender: false },
    { enabled: true, test: true, prerender: false },
    { enabled: true, test: false, prerender: true },
  ])('does not start when disabled or during tests/build-time prerendering: %o', (context) => {
    expect(shouldStartRecruitingWorker(context)).toBe(false)
  })

  it('starts only for an explicitly enabled runtime server', () => {
    expect(shouldStartRecruitingWorker({
      enabled: true,
      test: false,
      prerender: false,
    })).toBe(true)
  })

  it('uses env and import-meta runtime signals instead of reading process.env', () => {
    const source = readFileSync(
      join(process.cwd(), 'server/plugins/recruiting-worker.ts'),
      'utf8',
    )

    expect(source).not.toContain('process.env')
  })
})

describe('recruiting worker lifecycle', () => {
  it('unrefs its timer and processes every task type through a bounded organization page', async () => {
    let scheduledTick: (() => void) | undefined
    const unref = vi.fn()
    const listOrganizationIds = vi.fn().mockResolvedValue(['org-1'])
    const processOrganization = vi.fn().mockResolvedValue(undefined)

    const worker = startRecruitingWorker({
      listOrganizationIds,
      processOrganization,
      logError: vi.fn(),
      scheduleRepeating(callback) {
        scheduledTick = callback
        return { unref }
      },
      clearRepeating: vi.fn(),
    })

    await flushPromises()

    expect(unref).toHaveBeenCalledOnce()
    expect(scheduledTick).toBeTypeOf('function')
    expect(listOrganizationIds).toHaveBeenCalledWith({
      afterOrganizationId: undefined,
      limit: 50,
      types: [
        'application_analysis',
        'document_parse',
        'document_upload_reconciliation',
      ],
    })
    expect(processOrganization).toHaveBeenCalledWith({
      organizationId: 'org-1',
      types: [
        'application_analysis',
        'document_parse',
        'document_upload_reconciliation',
      ],
      abortSignal: expect.any(AbortSignal),
    })

    await worker.close()
  })

  it('advances a cursor across full runnable-organization pages', async () => {
    let scheduledTick!: () => void
    const firstPage = Array.from({ length: 50 }, (_, index) => `org-${String(index + 1).padStart(2, '0')}`)
    const listOrganizationIds = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(['org-51'])
    const processOrganization = vi.fn().mockResolvedValue(undefined)

    const worker = startRecruitingWorker({
      listOrganizationIds,
      processOrganization,
      logError: vi.fn(),
      scheduleRepeating(callback) {
        scheduledTick = callback
        return { unref: vi.fn() }
      },
      clearRepeating: vi.fn(),
    })

    await vi.waitFor(() => expect(processOrganization).toHaveBeenCalledTimes(50))
    await flushPromises()
    scheduledTick()
    await vi.waitFor(() => expect(listOrganizationIds).toHaveBeenCalledTimes(2))

    expect(listOrganizationIds.mock.calls[1]?.[0]).toMatchObject({
      afterOrganizationId: 'org-50',
      limit: 50,
    })

    await worker.close()
  })

  it('does not overlap scheduled cycles', async () => {
    let scheduledTick!: () => void
    const firstRun = deferred()
    const processOrganization = vi.fn()
      .mockImplementationOnce(() => firstRun.promise)
      .mockResolvedValue(undefined)

    const worker = startRecruitingWorker({
      listOrganizationIds: vi.fn().mockResolvedValue(['org-1']),
      processOrganization,
      logError: vi.fn(),
      scheduleRepeating(callback) {
        scheduledTick = callback
        return { unref: vi.fn() }
      },
      clearRepeating: vi.fn(),
    })

    await flushPromises()
    scheduledTick()
    scheduledTick()
    await flushPromises()
    expect(processOrganization).toHaveBeenCalledTimes(1)

    firstRun.resolve()
    await flushPromises()
    scheduledTick()
    await flushPromises()
    expect(processOrganization).toHaveBeenCalledTimes(2)

    await worker.close()
  })

  it('aborts and awaits the active cycle before closing', async () => {
    let activeSignal: AbortSignal | undefined
    const release = deferred()
    const clearRepeating = vi.fn()
    const processOrganization = vi.fn().mockImplementation(
      ({ abortSignal }: { abortSignal: AbortSignal }) => {
        activeSignal = abortSignal
        return release.promise
      },
    )

    const worker = startRecruitingWorker({
      listOrganizationIds: vi.fn().mockResolvedValue(['org-1']),
      processOrganization,
      logError: vi.fn(),
      scheduleRepeating: () => ({ unref: vi.fn() }),
      clearRepeating,
    })

    await flushPromises()
    const closePromise = worker.close()

    expect(clearRepeating).toHaveBeenCalledOnce()
    expect(activeSignal?.aborted).toBe(true)

    let closed = false
    void closePromise.then(() => { closed = true })
    await flushPromises()
    expect(closed).toBe(false)

    release.resolve()
    await closePromise
    expect(closed).toBe(true)
  })

  it('continues after an organization failure without logging raw errors', async () => {
    const logError = vi.fn()
    const processOrganization = vi.fn()
      .mockRejectedValueOnce(new Error('candidate private data and storage key'))
      .mockResolvedValueOnce(undefined)

    const worker = startRecruitingWorker({
      listOrganizationIds: vi.fn().mockResolvedValue(['org-1', 'org-2']),
      processOrganization,
      logError,
      scheduleRepeating: () => ({ unref: vi.fn() }),
      clearRepeating: vi.fn(),
    })

    await flushPromises()

    expect(processOrganization).toHaveBeenCalledTimes(2)
    expect(logError).toHaveBeenCalledWith('recruiting_worker.organization_failed', {
      result_code: 'processing_cycle_failed',
    })
    expect(JSON.stringify(logError.mock.calls)).not.toContain('org-1')
    expect(JSON.stringify(logError.mock.calls)).not.toContain('candidate private data')
    expect(JSON.stringify(logError.mock.calls)).not.toContain('storage key')

    await worker.close()
  })

  it('logs organization discovery failures with a stable code only', async () => {
    const logError = vi.fn()
    const worker = startRecruitingWorker({
      listOrganizationIds: vi.fn().mockRejectedValue(new Error('database password leaked here')),
      processOrganization: vi.fn(),
      logError,
      scheduleRepeating: () => ({ unref: vi.fn() }),
      clearRepeating: vi.fn(),
    })

    await flushPromises()

    expect(logError).toHaveBeenCalledWith('recruiting_worker.discovery_failed', {
      result_code: 'organization_discovery_failed',
    })
    expect(JSON.stringify(logError.mock.calls)).not.toContain('database password')

    await worker.close()
  })
})
