import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  rollbackPublicApplicationSubmission,
  type PublicApplicationRollbackAdapter,
} from '../../server/utils/rollbackPublicApplicationSubmission'

describe('public application upload compensation', () => {
  it('cancels document and application work before deletion without sensitive recovery logs', () => {
    const source = readFileSync(
      join(process.cwd(), 'server/utils/rollbackPublicApplicationSubmission.ts'),
      'utf8',
    )
    const defaultAdapter = source.slice(source.indexOf('const defaultAdapter'))
    expect(defaultAdapter).toContain('cancelProcessingTasksInTransaction')
    expect(defaultAdapter.indexOf('cancelProcessingTasksInTransaction'))
      .toBeLessThan(defaultAdapter.indexOf('const [lockedApplication] = await tx.select'))
    expect(source).toContain("type: 'application_analysis'")
    expect(source.indexOf('cancelProcessingTasksInTransaction'))
      .toBeLessThan(source.indexOf('await tx.delete(document)'))
    expect(source.indexOf('cancelProcessingTasksInTransaction'))
      .toBeLessThan(source.indexOf('await tx.delete(application)'))
    expect(source).not.toContain('storage_key:')
    expect(source).not.toContain('error_message:')
    expect(source).not.toContain('application_id:')
    expect(source).toContain("result_code: 'storage_cleanup_failed'")
  })

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
    expect(events[0]).toBe('database')
    expect(new Set(events.slice(1))).toEqual(new Set(['storage:one.pdf', 'storage:two.pdf']))
  })

  it('starts all unique storage deletions concurrently', async () => {
    const started: string[] = []
    const releases = new Map<string, () => void>()
    const adapter: PublicApplicationRollbackAdapter = {
      cleanupRelationalRecords: vi.fn(async () => {}),
      deleteStorageObject: vi.fn(async (storageKey) => {
        started.push(storageKey)
        await new Promise<void>((resolve) => releases.set(storageKey, resolve))
      }),
    }

    const rollback = rollbackPublicApplicationSubmission({
      applicationId: 'application-1',
      organizationId: 'org-1',
      storageKeys: ['one.pdf', 'two.pdf', 'one.pdf'],
    }, adapter)

    await vi.waitFor(() => expect(started).toEqual(['one.pdf', 'two.pdf']))
    for (const release of releases.values()) release()

    await expect(rollback).resolves.toEqual({ relationalCleanupSucceeded: true })
    expect(adapter.deleteStorageObject).toHaveBeenCalledTimes(2)
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
