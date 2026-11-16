import { describe, expect, it, vi } from 'vitest'
import { advanceRotation } from '../../scripts/microsoft-rotation.mjs'

const prior = { keyId: 'previous', expiresAt: '2027-02-11T04:11:56Z' }
const next = { keyId: 'next', expiresAt: '2027-04-11T04:11:56Z' }
const now = new Date('2027-01-20T00:00:00Z')

function adapters() {
  return {
    begin: vi.fn().mockResolvedValue(undefined),
    issue: vi.fn().mockResolvedValue(next),
    save: vi.fn().mockResolvedValue(undefined),
    activate: vi.fn().mockResolvedValue(undefined),
    prove: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue(undefined),
    retire: vi.fn().mockResolvedValue(undefined),
  }
}

describe('Microsoft credential rotation', () => {
  it('records intent, persists the replacement, activates it and verifies it before promotion', async () => {
    const io = adapters()
    await advanceRotation({ current: prior, pending: null }, io, { now, apply: true })
    const calls = ['begin', 'issue', 'save', 'activate', 'prove', 'finish'] as const
    expect(calls.map(name => io[name].mock.invocationCallOrder[0]))
      .toEqual(calls.map((_, index) => io.begin.mock.invocationCallOrder[0]! + index))
    expect(io.retire).not.toHaveBeenCalled()
  })

  it('leaves the successor staged when production verification fails', async () => {
    const io = adapters()
    io.prove.mockRejectedValue(new Error('runtime failed'))
    await expect(advanceRotation({ current: prior, pending: next }, io, { now, apply: true })).rejects.toThrow('runtime failed')
    expect(io.issue).not.toHaveBeenCalled()
    expect(io.finish).not.toHaveBeenCalled()
    expect(io.retire).not.toHaveBeenCalled()
  })

  it('keeps dry runs read-only and stops uncertain issuance', async () => {
    const io = adapters()
    await expect(advanceRotation({ current: prior, pending: null }, io, { now, apply: false })).resolves.toBe('due')
    expect(io.begin).not.toHaveBeenCalled()
    await expect(advanceRotation({ current: prior, pending: {} }, io, { now, apply: true })).rejects.toThrow('issuance needs reconciliation')
    expect(io.issue).not.toHaveBeenCalled()
  })

  it('starts scheduled rotation before the first expiry warning', async () => {
    const io = adapters()
    const state = { current: prior, pending: null }
    await expect(advanceRotation(state, io, { now: new Date('2027-01-05T00:00:00Z'), apply: true })).resolves.toBe('current')
    expect(io.begin).not.toHaveBeenCalled()
    await expect(advanceRotation(state, io, { now: new Date('2027-01-10T00:00:00Z') })).resolves.toBe('due')
  })

  it('keeps the previous key through overlap and proves production before retiring it', async () => {
    const io = adapters()
    const previous = { ...prior, retireAfter: '2027-01-27T00:00:00Z' }
    const state = { current: next, pending: null, previous }
    await expect(advanceRotation(state, io, { now, apply: true })).resolves.toBe('overlap')
    expect(io.retire).not.toHaveBeenCalled()

    const afterOverlap = { now: new Date('2027-01-28T00:00:00Z'), apply: true }
    io.prove.mockRejectedValueOnce(new Error('runtime failed'))
    await expect(advanceRotation(state, io, afterOverlap)).rejects.toThrow('runtime failed')
    expect(io.retire).not.toHaveBeenCalled()
    await expect(advanceRotation(state, io, afterOverlap)).resolves.toBe('retired')
    expect(io.prove).toHaveBeenLastCalledWith(next)
    expect(io.retire).toHaveBeenCalledExactlyOnceWith(previous)
  })
})
