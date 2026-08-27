import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { envSchema } from '../../server/utils/env'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  dbExecute: vi.fn(),
  execFileAsync: vi.fn(),
  getAppVersion: vi.fn(),
  isInstanceAdminUserId: vi.fn(),
  logWarn: vi.fn(),
  mkdir: vi.fn(),
  requireAuth: vi.fn(),
  requireInstanceAdmin: vi.fn(),
  s3Send: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('node:fs/promises', () => ({
  access: mocks.access,
  mkdir: mocks.mkdir,
  unlink: mocks.unlink,
  writeFile: mocks.writeFile,
}))
vi.mock('node:util', () => ({
  promisify: () => mocks.execFileAsync,
}))
vi.mock('../../server/utils/appVersion', () => ({
  getAppVersion: mocks.getAppVersion,
}))

const instanceAdminEnv = {
  DATABASE_URL: 'postgresql://factory:secret@db.example.test:5432/factory',
  FACTORY_INSTANCE_ADMIN_USER_IDS: new Set<string>(),
  S3_BUCKET: 'factory-careers-test',
}

vi.stubGlobal('buildPgDumpEnv', vi.fn(() => ({})))
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string }) =>
  Object.assign(new Error(options.statusMessage), options))
vi.stubGlobal('db', { execute: mocks.dbExecute })
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('env', instanceAdminEnv)
vi.stubGlobal('getS3Client', () => ({ send: mocks.s3Send }))
vi.stubGlobal('isInstanceAdminUserId', mocks.isInstanceAdminUserId)
vi.stubGlobal('logWarn', mocks.logWarn)
vi.stubGlobal('requireAuth', mocks.requireAuth)
vi.stubGlobal('requireInstanceAdmin', mocks.requireInstanceAdmin)
vi.stubGlobal('requirePermission', vi.fn().mockResolvedValue({
  user: { id: 'tenant-owner' },
  session: { activeOrganizationId: 'org-owned' },
}))

const {
  isInstanceAdminUserId,
  requireInstanceAdmin,
} = await import('../../server/utils/instanceAdmin')
const applyUpdateHandler = (await import('../../server/api/updates/apply.post')).default as
  (event: unknown) => Promise<Record<string, unknown>>
const backupHandler = (await import('../../server/api/updates/backup.post')).default as
  (event: unknown) => Promise<Record<string, unknown>>
const systemHandler = (await import('../../server/api/updates/system.get')).default as
  (event: unknown) => Promise<Record<string, unknown>>

const validEnv = {
  DATABASE_URL: 'postgresql://factory:secret@db.example.test:5432/factory',
  BETTER_AUTH_SECRET: 'a-secure-auth-secret-that-is-long-enough',
  BETTER_AUTH_URL: 'https://careers.example.test',
  S3_ENDPOINT: 'https://storage.example.test',
  S3_ACCESS_KEY: 'access-key',
  S3_SECRET_KEY: 'secret-key',
  S3_BUCKET: 'factory-careers-test',
}

describe('instance administrator identity parsing', () => {
  it.each([
    [undefined, []],
    ['', []],
    ['   ', []],
    [' user-alpha, user-beta ,, user-alpha ', ['user-alpha', 'user-beta']],
  ])('parses %j as an immutable exact-ID set', (configuredIds, expectedIds) => {
    const parsed = envSchema.parse({
      ...validEnv,
      FACTORY_INSTANCE_ADMIN_USER_IDS: configuredIds,
    }).FACTORY_INSTANCE_ADMIN_USER_IDS

    expect([...parsed]).toEqual(expectedIds)
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(() => (parsed as Set<string>).add('user-injected')).toThrow()
  })

  it('matches only complete case-sensitive user IDs', () => {
    const allowedIds = new Set(['User-Exact-123'])

    expect(isInstanceAdminUserId('User-Exact-123', allowedIds)).toBe(true)
    expect(isInstanceAdminUserId('User-Exact', allowedIds)).toBe(false)
    expect(isInstanceAdminUserId('user-exact-123', allowedIds)).toBe(false)
    expect(isInstanceAdminUserId('', allowedIds)).toBe(false)
  })
})

describe('instance administrator authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    instanceAdminEnv.FACTORY_INSTANCE_ADMIN_USER_IDS = new Set()
    mocks.requireAuth.mockResolvedValue({
      user: { id: 'tenant-owner' },
      session: { activeOrganizationId: 'org-owned' },
    })
    mocks.requireInstanceAdmin.mockResolvedValue({
      user: { id: 'instance-admin' },
      session: { activeOrganizationId: 'org-any' },
    })
    mocks.getAppVersion.mockResolvedValue('1.0.0')
    mocks.access.mockRejectedValue(new Error('not running in Docker'))
    mocks.dbExecute.mockResolvedValue([])
    mocks.s3Send.mockResolvedValue({})
    mocks.isInstanceAdminUserId.mockReturnValue(false)
  })

  it('denies a tenant owner when the instance allowlist is empty', async () => {
    await expect(requireInstanceAdmin({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden: instance administrator access required',
    })

    expect(mocks.logWarn).toHaveBeenCalledWith('instance_admin.access_denied', {
      result_code: 'user_not_allowlisted',
    })
    expect(JSON.stringify(mocks.logWarn.mock.calls)).not.toContain('tenant-owner')
  })

  it('returns the authenticated session for an exact allowlisted user ID', async () => {
    instanceAdminEnv.FACTORY_INSTANCE_ADMIN_USER_IDS = new Set(['instance-admin'])
    mocks.requireAuth.mockResolvedValue({
      user: { id: 'instance-admin' },
      session: { activeOrganizationId: 'org-member' },
    })

    await expect(requireInstanceAdmin({} as never)).resolves.toMatchObject({
      user: { id: 'instance-admin' },
    })
    expect(mocks.logWarn).not.toHaveBeenCalled()
  })

  it('denies both host mutation routes before filesystem or child-process work starts', async () => {
    const forbidden = Object.assign(new Error('Forbidden'), { statusCode: 403 })
    mocks.requireInstanceAdmin.mockRejectedValue(forbidden)

    await expect(applyUpdateHandler({ path: '/api/updates/apply' })).rejects.toBe(forbidden)
    await expect(backupHandler({ path: '/api/updates/backup' })).rejects.toBe(forbidden)

    expect(mocks.getAppVersion).not.toHaveBeenCalled()
    expect(mocks.access).not.toHaveBeenCalled()
    expect(mocks.mkdir).not.toHaveBeenCalled()
    expect(mocks.execFileAsync).not.toHaveBeenCalled()
  })

  it('lets an allowed user reach the existing update handler checks', async () => {
    await expect(applyUpdateHandler({ path: '/api/updates/apply' })).resolves.toMatchObject({
      success: false,
      previousVersion: '1.0.0',
    })

    expect(mocks.requireInstanceAdmin).toHaveBeenCalledOnce()
    expect(mocks.getAppVersion).toHaveBeenCalledOnce()
    expect(mocks.access).toHaveBeenCalledWith('/.dockerenv')
  })
})

describe('instance administrator system and UI contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({
      user: { id: 'user-system-contract' },
      session: { activeOrganizationId: 'org-system-contract' },
    })
    mocks.getAppVersion.mockResolvedValue('1.0.0')
    mocks.access.mockRejectedValue(new Error('not running in Docker'))
    mocks.dbExecute.mockResolvedValue([])
    mocks.s3Send.mockResolvedValue({})
  })

  it.each([true, false])('returns canAdministerInstance=%s for the authenticated user', async (allowed) => {
    mocks.isInstanceAdminUserId.mockReturnValue(allowed)

    await expect(systemHandler({})).resolves.toMatchObject({
      canAdministerInstance: allowed,
    })
    expect(mocks.isInstanceAdminUserId).toHaveBeenCalledWith('user-system-contract')
  })

  it('gates host controls on the server-provided capability instead of tenant ownership', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/pages/dashboard/updates.vue'),
      'utf8',
    )

    expect(page).toContain('const canAdministerInstance = computed')
    expect(page).toContain('v-if="canAdministerInstance && versionInfo?.updateAvailable"')
    expect(page).toContain('Host administration is unavailable for this account.')
    expect(page).not.toContain('const { allowed: isOwner }')
  })
})
