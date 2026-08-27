import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'

const mocks = vi.hoisted(() => ({
  canAccess: vi.fn(),
  getParams: vi.fn(),
  readBody: vi.fn(),
  recordActivity: vi.fn(),
  requirePermission: vi.fn(),
  returning: vi.fn(),
  update: vi.fn(),
}))

vi.mock('../../server/utils/privacyRequests', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../server/utils/privacyRequests')>(),
  canAccessPrivacyRequestForOrg: mocks.canAccess,
}))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', createError)
vi.stubGlobal('getValidatedRouterParams', mocks.getParams)
vi.stubGlobal('readValidatedBody', mocks.readBody)
vi.stubGlobal('recordActivity', mocks.recordActivity)
vi.stubGlobal('requirePermission', mocks.requirePermission)
vi.stubGlobal('db', {
  update: mocks.update,
})

const handler = (await import('../../server/api/privacy-requests/[id].patch')).default as
  (event: unknown) => Promise<Record<string, unknown>>

function request(status: 'in_review' | 'completed' | 'denied' | 'cancelled') {
  return {
    id: 'privacy-1',
    organizationId: 'org-1',
    status,
    reviewedAt: null,
    resolutionNotes: null,
    denialReason: null,
  }
}

describe('privacy request status updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({
      session: { activeOrganizationId: 'org-1' },
      user: { id: 'operator-1' },
    })
    mocks.getParams.mockResolvedValue({ id: 'privacy-1' })
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({ returning: mocks.returning }),
      }),
    })
  })

  it.each(['denied', 'cancelled'] as const)('rejects reopening a %s terminal disposition', async (status) => {
    mocks.canAccess.mockResolvedValue(request(status))
    mocks.readBody.mockResolvedValue({ status: 'in_review' })

    await expect(handler({})).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('permits an explicit denial while erasure is active', async () => {
    mocks.canAccess.mockResolvedValue(request('in_review'))
    mocks.readBody.mockResolvedValue({ status: 'denied' })
    mocks.returning.mockResolvedValue([{ ...request('denied'), reviewedById: 'operator-1' }])

    await expect(handler({})).resolves.toMatchObject({ status: 'denied' })
  })

  it('rejects a stale update when worker completion wins the race', async () => {
    mocks.canAccess.mockResolvedValue(request('in_review'))
    mocks.readBody.mockResolvedValue({ status: 'denied' })
    mocks.returning.mockResolvedValue([])

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Privacy request changed; refresh before updating',
    })
  })
})
