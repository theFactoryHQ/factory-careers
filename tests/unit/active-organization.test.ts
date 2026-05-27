import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
}))

vi.stubGlobal('db', {
  select: mocks.select,
  update: mocks.update,
})

const { resolveActiveOrganizationId } = await import('../../server/utils/activeOrganization')

function mockMemberships(rows: Array<{ organizationId: string }>) {
  mocks.select.mockReturnValue({ from: mocks.from })
  mocks.from.mockReturnValue({ where: mocks.where })
  mocks.where.mockReturnValue({ limit: mocks.limit })
  mocks.limit.mockResolvedValue(rows)
}

function mockUpdate() {
  mocks.update.mockReturnValue({ set: mocks.set })
  mocks.set.mockReturnValue({ where: mocks.updateWhere })
  mocks.updateWhere.mockResolvedValue(undefined)
}

describe('resolveActiveOrganizationId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate()
  })

  it('returns an existing active organization without querying memberships', async () => {
    await expect(resolveActiveOrganizationId({
      user: { id: 'user-1' },
      session: { id: 'session-1', activeOrganizationId: 'org-active' },
    })).resolves.toBe('org-active')

    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('persists the only organization membership onto sessions minted without an active organization', async () => {
    mockMemberships([{ organizationId: 'org-only' }])

    await expect(resolveActiveOrganizationId({
      user: { id: 'user-1' },
      session: { id: 'session-1', token: 'session-token' },
    })).resolves.toBe('org-only')

    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({
      activeOrganizationId: 'org-only',
      updatedAt: expect.any(Date),
    }))
  })

  it('does not choose an active organization when membership selection is ambiguous', async () => {
    mockMemberships([
      { organizationId: 'org-one' },
      { organizationId: 'org-two' },
    ])

    await expect(resolveActiveOrganizationId({
      user: { id: 'user-1' },
      session: { id: 'session-1' },
    })).resolves.toBeNull()

    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('does not choose an active organization when the session cannot be persisted', async () => {
    mockMemberships([{ organizationId: 'org-only' }])

    await expect(resolveActiveOrganizationId({
      user: { id: 'user-1' },
      session: {},
    })).resolves.toBeNull()

    expect(mocks.update).not.toHaveBeenCalled()
  })
})
