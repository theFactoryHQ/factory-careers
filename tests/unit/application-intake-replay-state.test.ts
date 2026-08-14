import { describe, expect, it, vi } from 'vitest'
import { prepareApplicationIntakeReplay } from '../../server/utils/applicationIntakeReplayState'

describe('application intake replay state', () => {
  it('continues when the receipt has no relational application', async () => {
    await expect(prepareApplicationIntakeReplay({
      organizationId: 'org-1',
      receiptId: 'receipt-1',
    }, {
      findApplication: vi.fn(async () => null),
      rollbackApplication: vi.fn(),
    })).resolves.toEqual({ outcome: 'ready' })
  })

  it('recognizes an already completed receipt without replaying it', async () => {
    const rollbackApplication = vi.fn()
    await expect(prepareApplicationIntakeReplay({
      organizationId: 'org-1',
      receiptId: 'receipt-1',
    }, {
      findApplication: vi.fn(async () => ({
        applicationId: 'app-1',
        candidateId: 'candidate-1',
        documents: [{ storageKey: 'doc-1', uploadStatus: 'completed' }],
      })),
      rollbackApplication,
    })).resolves.toEqual({ outcome: 'already_completed' })
    expect(rollbackApplication).not.toHaveBeenCalled()
  })

  it('replays an application row that has no completed document rows', async () => {
    const rollbackApplication = vi.fn(async () => ({
      relationalCleanupSucceeded: true,
      storageCleanupSucceeded: true,
    }))
    await expect(prepareApplicationIntakeReplay({
      organizationId: 'org-1',
      receiptId: 'receipt-1',
    }, {
      findApplication: vi.fn(async () => ({
        applicationId: 'app-1',
        candidateId: 'candidate-1',
        documents: [],
      })),
      rollbackApplication,
    })).resolves.toEqual({ outcome: 'ready' })
    expect(rollbackApplication).toHaveBeenCalledOnce()
  })

  it('removes a partial receipt application before a clean replay', async () => {
    const rollbackApplication = vi.fn(async () => ({
      relationalCleanupSucceeded: true,
      storageCleanupSucceeded: true,
    }))
    await expect(prepareApplicationIntakeReplay({
      organizationId: 'org-1',
      receiptId: 'receipt-1',
    }, {
      findApplication: vi.fn(async () => ({
        applicationId: 'app-1',
        candidateId: 'candidate-1',
        documents: [
          { storageKey: 'doc-1', uploadStatus: 'completed' },
          { storageKey: 'doc-2', uploadStatus: 'pending' },
        ],
      })),
      rollbackApplication,
    })).resolves.toEqual({ outcome: 'ready' })
    expect(rollbackApplication).toHaveBeenCalledWith({
      applicationId: 'app-1',
      candidateId: 'candidate-1',
      organizationId: 'org-1',
      storageKeys: ['doc-1', 'doc-2'],
    })
  })

  it('refuses replay when partial cleanup leaves relational or storage residue', async () => {
    await expect(prepareApplicationIntakeReplay({
      organizationId: 'org-1',
      receiptId: 'receipt-1',
    }, {
      findApplication: vi.fn(async () => ({
        applicationId: 'app-1',
        candidateId: 'candidate-1',
        documents: [{ storageKey: 'doc-1', uploadStatus: 'pending' }],
      })),
      rollbackApplication: vi.fn(async () => ({
        relationalCleanupSucceeded: true,
        storageCleanupSucceeded: false,
      })),
    })).rejects.toThrow(/cleanup/i)
  })
})
