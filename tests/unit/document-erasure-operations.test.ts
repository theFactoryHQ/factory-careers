import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  processCycle: vi.fn(),
  readValidatedBody: vi.fn(),
  requireInstanceAdmin: vi.fn(),
  setResponseHeader: vi.fn(),
}))

vi.mock('../../server/utils/documentErasureQueue', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../server/utils/documentErasureQueue')>(),
  getDocumentErasureOperationsSnapshot: mocks.getSnapshot,
}))
vi.mock('../../server/utils/processDocumentErasures', () => ({
  processDocumentErasureCycle: mocks.processCycle,
}))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('env', { DOCUMENT_ERASURE_WORKER_ENABLED: false })
vi.stubGlobal('readValidatedBody', mocks.readValidatedBody)
vi.stubGlobal('requireInstanceAdmin', mocks.requireInstanceAdmin)
vi.stubGlobal('setResponseHeader', mocks.setResponseHeader)

const statusHandler = (await import('../../server/api/operations/document-erasure.get')).default as
  (event: unknown) => Promise<Record<string, unknown>>
const drainHandler = (await import('../../server/api/operations/document-erasure/drain.post')).default as
  (event: unknown) => Promise<Record<string, unknown>>

const snapshot = {
  counts: { pending: 2, processing: 1, completed: 4, failed: 1 },
  oldestPendingAgeSeconds: 300,
  oldestProcessingAgeSeconds: 40,
  resultCodes: [
    { code: 'storage_timeout', count: 1 },
    { code: 'erased', count: 4 },
  ],
}

describe('document erasure operator routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireInstanceAdmin.mockResolvedValue({ user: { id: 'operator' } })
    mocks.getSnapshot.mockResolvedValue(snapshot)
    mocks.processCycle.mockResolvedValue({ claimed: 2, succeeded: 1, retried: 1, failed: 0 })
    mocks.readValidatedBody.mockImplementation(async (_event, parse) => parse({ confirm: true, limit: 10 }))
  })

  it('returns only sanitized aggregate status after instance-admin authorization', async () => {
    const result = await statusHandler({})
    expect(result).toEqual({
      ok: true,
      code: 'document_erasure_status',
      workerEnabled: false,
      ...snapshot,
    })
    expect(mocks.requireInstanceAdmin.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.getSnapshot.mock.invocationCallOrder[0]!)
    expect(mocks.setResponseHeader).toHaveBeenCalledWith({}, 'Cache-Control', 'no-store')
    expect(JSON.stringify(result)).not.toMatch(/storageKey|organizationId|privacyRequestId|candidate|provider|message/i)
  })

  it('rejects unauthorized drain before body parsing or queue work', async () => {
    const forbidden = Object.assign(new Error('Forbidden'), { statusCode: 403 })
    mocks.requireInstanceAdmin.mockRejectedValue(forbidden)
    await expect(drainHandler({})).rejects.toBe(forbidden)
    expect(mocks.readValidatedBody).not.toHaveBeenCalled()
    expect(mocks.processCycle).not.toHaveBeenCalled()
    expect(mocks.getSnapshot).not.toHaveBeenCalled()
  })

  it('requires strict confirmation, bounds the cycle, and returns fresh aggregates', async () => {
    const event = {}
    const result = await drainHandler(event)
    expect(mocks.processCycle).toHaveBeenCalledWith({ limit: 10 })
    expect(mocks.getSnapshot.mock.invocationCallOrder[0])
      .toBeGreaterThan(mocks.processCycle.mock.invocationCallOrder[0]!)
    expect(result).toEqual({
      ok: true,
      code: 'document_erasure_drain_completed',
      workerEnabled: false,
      cycle: { claimed: 2, succeeded: 1, retried: 1, failed: 0 },
      ...snapshot,
    })
  })

  it.each([
    {},
    { confirm: false },
    { confirm: true, limit: 0 },
    { confirm: true, limit: 51 },
    { confirm: true, limit: 10, storageKey: 'private/key' },
  ])('rejects an unsafe drain body %o', async (body) => {
    mocks.readValidatedBody.mockImplementation(async (_event, parse) => parse(body))
    await expect(drainHandler({})).rejects.toBeTruthy()
    expect(mocks.processCycle).not.toHaveBeenCalled()
  })
})

describe('document erasure operations guidance', () => {
  it('documents disabled-first rollout, explicit enablement, rollback, and separate reconciliation', () => {
    const rollout = readFileSync(join(process.cwd(), 'docs/operations/DOCUMENT-ERASURE-ROLLOUT.md'), 'utf8')
    const reconciliation = readFileSync(join(process.cwd(), 'docs/operations/DOCUMENT-ERASURE-RECONCILIATION.md'), 'utf8')

    expect(rollout).toContain('DOCUMENT_ERASURE_WORKER_ENABLED=false')
    expect(rollout).toContain('explicit privacy, security, and operations approval')
    expect(rollout).toContain('DOCUMENT_ERASURE_WORKER_ENABLED=true')
    expect(rollout).toContain('operations document-erasure drain --yes --limit 10 --json')
    expect(reconciliation).toContain('separate privacy operation')
    expect(reconciliation).toContain('Never scan or delete a whole bucket or an unscoped prefix')
    expect(reconciliation).toContain('Do not enable reconciliation as part of the worker rollout')
  })
})
