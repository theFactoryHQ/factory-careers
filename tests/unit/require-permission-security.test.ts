import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertFactoryStaffAccess: vi.fn(),
  getSession: vi.fn(),
  hasPermission: vi.fn(),
}))

vi.mock('../../server/utils/factoryAccess', () => ({
  assertFactoryStaffAccess: mocks.assertFactoryStaffAccess,
}))

const { requirePermission } = await import('../../server/utils/requirePermission')

function makeError(opts: { statusCode: number; statusMessage?: string }) {
  return Object.assign(new Error(opts.statusMessage), opts)
}

describe('requirePermission security boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('createError', makeError)
    vi.stubGlobal('auth', {
      api: {
        getSession: mocks.getSession,
        hasPermission: mocks.hasPermission,
      },
    })

    mocks.getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'doug@thefactoryhq.com' },
      session: { activeOrganizationId: 'org-factory' },
    })
    mocks.hasPermission.mockResolvedValue({ error: null })
  })

  it('enforces Factory staff access before returning a permission-gated session', async () => {
    const result = await requirePermission({ headers: new Headers() } as any, { job: ['read'] })

    expect(result.session.activeOrganizationId).toBe('org-factory')
    expect(mocks.assertFactoryStaffAccess).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'doug@thefactoryhq.com',
      activeOrganizationId: 'org-factory',
    })
  })

  it('does not check route permissions when Factory access fails', async () => {
    mocks.assertFactoryStaffAccess.mockRejectedValueOnce(makeError({
      statusCode: 403,
      statusMessage: 'Factory organization required',
    }))

    await expect(
      requirePermission({ headers: new Headers() } as any, { job: ['read'] }),
    ).rejects.toMatchObject({ statusCode: 403 })

    expect(mocks.hasPermission).not.toHaveBeenCalled()
  })
})
