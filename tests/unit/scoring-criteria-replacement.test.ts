import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bulkCriteriaSchema } from '../../server/utils/schemas/scoring'

const transaction = vi.fn()
const jobFindFirst = vi.fn()
const directDelete = vi.fn()
const directInsert = vi.fn()
const txDelete = vi.fn()
const txDeleteWhere = vi.fn()
const txInsert = vi.fn()
const txInsertValues = vi.fn()
const txInsertReturning = vi.fn()
const readValidatedBody = vi.fn()
const recordActivity = vi.fn()
const setResponseStatus = vi.fn()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requirePermission', vi.fn())
vi.stubGlobal('getValidatedRouterParams', vi.fn())
vi.stubGlobal('readValidatedBody', readValidatedBody)
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string }) =>
  Object.assign(new Error(options.statusMessage), options),
)
vi.stubGlobal('recordActivity', recordActivity)
vi.stubGlobal('setResponseStatus', setResponseStatus)
vi.stubGlobal('db', {
  query: {
    job: { findFirst: jobFindFirst },
  },
  transaction,
  delete: directDelete,
  insert: directInsert,
})

const replaceCriteria = (await import('../../server/api/jobs/[id]/criteria/index.post')).default as
  (event: { responseStatus?: number }) => Promise<{ criteria: Array<{ id: string, key: string }> }>

function criterion(key: string) {
  return {
    key,
    name: key,
  }
}

describe('bulk scoring criteria schema', () => {
  it('accepts distinct criterion keys', () => {
    expect(bulkCriteriaSchema.safeParse({
      criteria: [criterion('typescript'), criterion('communication')],
    }).success).toBe(true)
  })

  it('rejects a repeated exact key at the repeated criterion', () => {
    const result = bulkCriteriaSchema.safeParse({
      criteria: [criterion('typescript'), criterion('typescript')],
    })

    expect(result.success).toBe(false)
    if (result.success) return

    expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'custom',
        path: ['criteria', 1, 'key'],
      }),
    ]))
  })

  it('reports each repeated key after its first occurrence', () => {
    const result = bulkCriteriaSchema.safeParse({
      criteria: [
        criterion('typescript'),
        criterion('communication'),
        criterion('typescript'),
        criterion('communication'),
      ],
    })

    expect(result.success).toBe(false)
    if (result.success) return

    expect(result.error.issues.map(issue => issue.path)).toEqual(expect.arrayContaining([
      ['criteria', 2, 'key'],
      ['criteria', 3, 'key'],
    ]))
  })
})

describe('bulk scoring criteria replacement API', () => {
  const created = [{ id: 'criterion_1', key: 'typescript' }]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requirePermission).mockResolvedValue({
      session: { activeOrganizationId: 'org_1' },
      user: { id: 'user_1' },
    })
    vi.mocked(getValidatedRouterParams).mockResolvedValue({ id: 'job_1' })
    readValidatedBody.mockImplementation(async (_event, parser) => parser({
      criteria: [criterion('typescript')],
    }))
    jobFindFirst.mockResolvedValue({ id: 'job_1' })
    directDelete.mockImplementation(() => {
      throw new Error('replace writes must use the transaction executor')
    })
    directInsert.mockImplementation(() => {
      throw new Error('replace writes must use the transaction executor')
    })
    txDeleteWhere.mockResolvedValue(undefined)
    txDelete.mockReturnValue({ where: txDeleteWhere })
    txInsertReturning.mockResolvedValue(created)
    txInsertValues.mockReturnValue({ returning: txInsertReturning })
    txInsert.mockReturnValue({ values: txInsertValues })
    transaction.mockImplementation(async callback => callback({
      delete: txDelete,
      insert: txInsert,
    }))
  })

  it('rejects duplicate request keys before beginning a transaction', async () => {
    readValidatedBody.mockImplementation(async (_event, parser) => parser({
      criteria: [criterion('typescript'), criterion('typescript')],
    }))

    await expect(replaceCriteria({})).rejects.toThrow('Criterion keys must be unique')

    expect(transaction).not.toHaveBeenCalled()
  })

  it('verifies job ownership before beginning replacement writes', async () => {
    jobFindFirst.mockResolvedValue(null)

    await expect(replaceCriteria({})).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Job not found',
    })

    expect(transaction).not.toHaveBeenCalled()
    expect(directDelete).not.toHaveBeenCalled()
    expect(directInsert).not.toHaveBeenCalled()
  })

  it('replaces criteria through one transaction and records activity after commit', async () => {
    const callOrder: string[] = []
    transaction.mockImplementation(async callback => {
      callOrder.push('transaction-start')
      const result = await callback({
        delete: txDelete,
        insert: txInsert,
      })
      callOrder.push('transaction-commit')
      return result
    })
    txDelete.mockImplementation(() => {
      callOrder.push('delete')
      return { where: txDeleteWhere }
    })
    txInsert.mockImplementation(() => {
      callOrder.push('insert')
      return { values: txInsertValues }
    })
    recordActivity.mockImplementation(() => callOrder.push('activity'))
    const event: { responseStatus?: number } = {}

    const result = await replaceCriteria(event)

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(txDelete).toHaveBeenCalledTimes(1)
    expect(txInsert).toHaveBeenCalledTimes(1)
    expect(directDelete).not.toHaveBeenCalled()
    expect(directInsert).not.toHaveBeenCalled()
    expect(callOrder).toEqual([
      'transaction-start',
      'delete',
      'insert',
      'transaction-commit',
      'activity',
    ])
    expect(result).toEqual({ criteria: created })
    expect(setResponseStatus).toHaveBeenCalledWith(event, 201)
  })

  it('does not record activity when an insert failure aborts the transaction', async () => {
    txInsertReturning.mockRejectedValueOnce(new Error('unique key conflict'))

    await expect(replaceCriteria({})).rejects.toThrow('unique key conflict')

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(txDelete).toHaveBeenCalledTimes(1)
    expect(txInsert).toHaveBeenCalledTimes(1)
    expect(recordActivity).not.toHaveBeenCalled()
  })
})
