import { describe, expect, it, vi } from 'vitest'
import {
  rollbackPublicApplicationSubmission,
  type PublicApplicationRollbackAdapter,
} from '../../server/utils/rollbackPublicApplicationSubmission'

describe('public application upload compensation', () => {
  it('commits relational cleanup before deleting uploaded objects', async () => {
    const events: string[] = []
    const adapter: PublicApplicationRollbackAdapter = {
      cleanupRelationalRecords: vi.fn(async () => {
        events.push('database')
      }),
      deleteStorageObject: vi.fn(async (storageKey) => {
        events.push(`storage:${storageKey}`)
      }),
    }

    const result = await rollbackPublicApplicationSubmission({
      applicationId: 'application-1',
      organizationId: 'org-1',
      storageKeys: ['one.pdf', 'two.pdf'],
    }, adapter)

    expect(result).toEqual({ relationalCleanupSucceeded: true })
    expect(events).toEqual(['database', 'storage:one.pdf', 'storage:two.pdf'])
  })

  it('preserves storage objects when relational cleanup fails', async () => {
    const deleteStorageObject = vi.fn(async () => {})
    const adapter: PublicApplicationRollbackAdapter = {
      cleanupRelationalRecords: vi.fn(async () => {
        throw new Error('database unavailable')
      }),
      deleteStorageObject,
    }

    const result = await rollbackPublicApplicationSubmission({
      applicationId: 'application-1',
      organizationId: 'org-1',
      storageKeys: ['one.pdf'],
    }, adapter)

    expect(result).toEqual({ relationalCleanupSucceeded: false })
    expect(deleteStorageObject).not.toHaveBeenCalled()
  })

  it('continues best-effort storage cleanup after an individual delete fails', async () => {
    const deleteStorageObject = vi.fn(async (storageKey: string) => {
      if (storageKey === 'one.pdf') throw new Error('temporary S3 error')
    })
    const adapter: PublicApplicationRollbackAdapter = {
      cleanupRelationalRecords: vi.fn(async () => {}),
      deleteStorageObject,
    }

    const result = await rollbackPublicApplicationSubmission({
      applicationId: 'application-1',
      organizationId: 'org-1',
      storageKeys: ['one.pdf', 'two.pdf'],
    }, adapter)

    expect(result).toEqual({ relationalCleanupSucceeded: true })
    expect(deleteStorageObject).toHaveBeenCalledTimes(2)
  })
})
