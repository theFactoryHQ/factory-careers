import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDependencyReadiness,
  markDependencyFailed,
  markDependencyReady,
  resetDependencyReadiness,
} from '../../server/utils/dependencyReadiness'
import { findApplicationRoleAccessFailures } from '../../server/utils/applicationDatabaseReadiness'
import { probeStorageReadiness, STORAGE_READINESS_CONTENT_TYPE } from '../../server/utils/storageReadiness'

describe('dependency readiness state', () => {
  beforeEach(() => resetDependencyReadiness())

  it('requires migrations, application database access, and storage without retaining errors', () => {
    expect(getDependencyReadiness()).toEqual({ migrations: false, applicationDatabase: false, storage: false })
    markDependencyReady('migrations')
    markDependencyFailed('storage', new Error('secret provider detail'))
    markDependencyReady('applicationDatabase')
    expect(getDependencyReadiness()).toEqual({ migrations: true, applicationDatabase: true, storage: false })
  })
})

describe('application database role contract', () => {
  it('accepts a least-privilege role with complete runtime grants', () => {
    expect(findApplicationRoleAccessFailures({
      role: { superuser: false, createDatabase: false, createRole: false, createInPublic: false },
      missingTablePrivileges: [],
      missingSequencePrivileges: [],
    })).toEqual([])
  })

  it('rejects elevated roles and missing table or sequence grants', () => {
    expect(findApplicationRoleAccessFailures({
      role: { superuser: true, createDatabase: true, createRole: false, createInPublic: true },
      missingTablePrivileges: ['application:INSERT'],
      missingSequencePrivileges: ['application_id_seq:USAGE'],
    })).toEqual([
      'application role must not be a superuser',
      'application role must not create databases',
      'application role must not create objects in public schema',
      'missing table privileges: application:INSERT',
      'missing sequence privileges: application_id_seq:USAGE',
    ])
  })
})

describe('storage readiness probe', () => {
  it('uses a content type accepted by the private applicant-document bucket', () => {
    expect(STORAGE_READINESS_CONTENT_TYPE).toBe('application/pdf')
  })

  it('writes, heads, and deletes a non-identifying canary object', async () => {
    const calls: string[] = []
    const key = await probeStorageReadiness({
      key: '_healthchecks/fixed.tmp',
      timeoutMs: 1000,
      put: async (value) => { calls.push(`put:${value}`) },
      head: async (value) => { calls.push(`head:${value}`); return true },
      remove: async (value) => { calls.push(`delete:${value}`) },
    })

    expect(key).toBe('_healthchecks/fixed.tmp')
    expect(calls).toEqual([
      'put:_healthchecks/fixed.tmp',
      'head:_healthchecks/fixed.tmp',
      'delete:_healthchecks/fixed.tmp',
    ])
  })

  it('attempts cleanup and fails when the written object cannot be headed', async () => {
    const remove = vi.fn(async () => {})
    await expect(probeStorageReadiness({
      key: '_healthchecks/fixed.tmp',
      timeoutMs: 1000,
      put: async () => {},
      head: async () => false,
      remove,
    })).rejects.toThrow('Storage readiness object was not readable')
    expect(remove).toHaveBeenCalledWith('_healthchecks/fixed.tmp', expect.any(AbortSignal))
  })

  it('times out a stalled operation and still attempts cleanup after a completed write', async () => {
    const remove = vi.fn(async () => {})
    await expect(probeStorageReadiness({
      key: '_healthchecks/fixed.tmp',
      timeoutMs: 5,
      put: async () => {},
      head: async (_key, signal) => await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
      remove,
    })).rejects.toThrow()
    expect(remove).toHaveBeenCalled()
  })
})
