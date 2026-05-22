import { beforeEach, describe, expect, it, vi } from 'vitest'

const organizationFindFirst = vi.fn()
const memberFindFirst = vi.fn()

function makeError(opts: { statusCode: number, statusMessage?: string }) {
  return Object.assign(new Error(opts.statusMessage), opts)
}

vi.stubGlobal('createError', makeError)
vi.stubGlobal('db', {
  query: {
    organization: { findFirst: organizationFindFirst },
    member: { findFirst: memberFindFirst },
  },
})

const { assertFactoryStaffAccess } = await import('../../server/utils/factoryAccess')

describe('Factory staff access guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('env', {
      FACTORY_ORG_SLUG: 'factory',
      FACTORY_DISABLE_PUBLIC_ORG_CREATION: true,
    })

    organizationFindFirst.mockResolvedValue({ id: 'org-1', slug: 'factory' })
    memberFindFirst.mockResolvedValue({ id: 'member-1' })
  })

  it('allows non-Factory organizations when public organization creation is enabled', async () => {
    vi.stubGlobal('env', {
      FACTORY_ORG_SLUG: 'factory',
      FACTORY_DISABLE_PUBLIC_ORG_CREATION: false,
    })
    organizationFindFirst.mockResolvedValueOnce({ id: 'org-1', slug: 'e2e-org' })

    await expect(assertFactoryStaffAccess({
      userId: 'user-1',
      email: 'tester@test.local',
      activeOrganizationId: 'org-1',
    })).resolves.toBeUndefined()
  })

  it('keeps non-Factory organizations blocked when single-org mode is enabled', async () => {
    organizationFindFirst.mockResolvedValueOnce({ id: 'org-1', slug: 'customer-org' })

    await expect(assertFactoryStaffAccess({
      userId: 'user-1',
      email: 'tester@test.local',
      activeOrganizationId: 'org-1',
    })).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Factory Careers staff access is limited to the Factory organization.',
    })
  })

  it('requires membership in the active organization', async () => {
    memberFindFirst.mockResolvedValueOnce(null)

    await expect(assertFactoryStaffAccess({
      userId: 'user-1',
      email: 'tester@thefactoryhq.com',
      activeOrganizationId: 'org-1',
    })).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Factory Careers access requires an invitation or administrator approval.',
    })
  })
})
