import { beforeEach, describe, expect, it, vi } from 'vitest'

const eqMock = vi.hoisted(() =>
  vi.fn((column: unknown, value: unknown) => ({ column, value })),
)

vi.mock('drizzle-orm', async (importOriginal) => {
  const original = await importOriginal<typeof import('drizzle-orm')>()

  return {
    ...original,
    eq: eqMock,
  }
})

const requirePermissionMock = vi.fn()
const countQueryMock = vi.fn()
const selectQueryMock = vi.fn()
const aggregateWhereMocks: Array<ReturnType<typeof vi.fn>> = []

function makeAggregateQuery(rows: Array<{ value: string | null, count: number }> = []) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn().mockResolvedValue(rows),
  }
  query.from.mockReturnValue(query)
  query.where.mockReturnValue(query)
  query.groupBy.mockReturnValue(query)
  aggregateWhereMocks.push(query.where)
  return query
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requirePermission', requirePermissionMock)
vi.stubGlobal('db', {
  $count: countQueryMock,
  select: selectQueryMock,
})

const complianceSummaryHandler = (
  await import('../../server/api/compliance/applications/summary.get')
).default as (event: unknown) => Promise<unknown>

describe('compliance summary authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aggregateWhereMocks.length = 0
    countQueryMock.mockResolvedValue(5)
    selectQueryMock.mockImplementation(() => makeAggregateQuery())
  })

  it('requires organization update permission before starting any aggregate query', async () => {
    const event = { path: '/api/compliance/applications/summary' }
    const forbidden = Object.assign(new Error('Forbidden'), { statusCode: 403 })
    requirePermissionMock.mockRejectedValue(forbidden)

    await expect(complianceSummaryHandler(event)).rejects.toBe(forbidden)

    expect(requirePermissionMock).toHaveBeenCalledWith(event, {
      organization: ['update'],
    })
    expect(countQueryMock).not.toHaveBeenCalled()
    expect(selectQueryMock).not.toHaveBeenCalled()
    expect(eqMock).not.toHaveBeenCalled()
  })

  it('scopes every aggregate query to the exact authorized organization ID', async () => {
    const activeOrganizationId = 'org-authorized-exactly'
    requirePermissionMock.mockResolvedValue({
      session: { activeOrganizationId },
    })

    await complianceSummaryHandler({})

    expect(countQueryMock).toHaveBeenCalledTimes(1)
    expect(selectQueryMock).toHaveBeenCalledTimes(4)
    expect(eqMock).toHaveBeenCalledTimes(5)
    for (const [, organizationId] of eqMock.mock.calls) {
      expect(organizationId).toBe(activeOrganizationId)
    }

    const organizationPredicates = eqMock.mock.results.map(result => result.value)
    expect(countQueryMock.mock.calls[0]?.[1]).toBe(organizationPredicates[0])
    expect(aggregateWhereMocks).toHaveLength(4)
    aggregateWhereMocks.forEach((whereMock, index) => {
      expect(whereMock).toHaveBeenCalledWith(organizationPredicates[index + 1])
    })
  })

  it('returns the helper-protected total instead of a raw below-threshold count', async () => {
    requirePermissionMock.mockResolvedValue({
      session: { activeOrganizationId: 'org-private-cohort' },
    })
    countQueryMock.mockResolvedValue(4)
    selectQueryMock.mockImplementation(() => makeAggregateQuery([
      { value: null, count: 4 },
    ]))

    await expect(complianceSummaryHandler({})).resolves.toEqual(expect.objectContaining({
      totalResponses: null,
      suppressed: true,
    }))
  })
})
