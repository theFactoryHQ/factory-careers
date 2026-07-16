import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScoringFeedbackSchema } from '../../server/utils/schemas/scoring'

const transaction = vi.fn()
const txSelect = vi.fn()
const txInsert = vi.fn()
const forUpdate = vi.fn()
const readValidatedBody = vi.fn()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requirePermission', vi.fn())
vi.stubGlobal('getValidatedRouterParams', vi.fn())
vi.stubGlobal('readValidatedBody', readValidatedBody)
vi.stubGlobal('createError', (opts: { statusCode: number, statusMessage?: string }) => Object.assign(new Error(opts.statusMessage), opts))
vi.stubGlobal('db', {
  transaction,
})

const submitScoringFeedback = (await import('../../server/api/applications/[id]/scoring-feedback.post')).default as (event: unknown) => Promise<any>

function lockedApplicationQuery(rows: Array<{ id: string, currentAnalysisRunId: string | null }>) {
  forUpdate.mockResolvedValue(rows)
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          for: forUpdate,
        })),
      })),
    })),
  }
}

describe('scoring feedback API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requirePermission).mockResolvedValue({
      session: { activeOrganizationId: 'org_1' },
      user: { id: 'user_1' },
    })
    vi.mocked(getValidatedRouterParams).mockResolvedValue({ id: 'app_1' })
    readValidatedBody.mockImplementation(async (_event, parser) => parser({
      sentiment: 'down',
      analysisRunId: 'run_1',
      comment: 'The evidence summary missed relevant context.',
    }))
    txSelect.mockReturnValue(lockedApplicationQuery([{ id: 'app_1', currentAnalysisRunId: 'run_1' }]))
    txInsert.mockReturnValue({
      values: vi.fn((values) => ({
        returning: vi.fn().mockResolvedValue([{
          id: 'feedback_1',
          sentiment: values.sentiment,
          comment: values.comment,
          analysisRunId: values.analysisRunId,
          createdAt: new Date('2026-05-25T00:00:00Z'),
        }]),
      })),
    })
    transaction.mockImplementation(async callback => callback({
      select: txSelect,
      insert: txInsert,
    }))
  })

  it('requires comments for thumbs-down feedback', () => {
    expect(createScoringFeedbackSchema.safeParse({ sentiment: 'down', comment: '' }).success).toBe(false)
    expect(createScoringFeedbackSchema.safeParse({ sentiment: 'up' }).success).toBe(true)
  })

  it('stores feedback on the application current scoring run', async () => {
    const result = await submitScoringFeedback({})

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(forUpdate).toHaveBeenCalledWith('update')
    expect(txInsert).toHaveBeenCalledTimes(1)
    const insertedValues = txInsert.mock.results[0]!.value.values.mock.calls[0]![0]
    expect(insertedValues).toMatchObject({
      organizationId: 'org_1',
      applicationId: 'app_1',
      analysisRunId: 'run_1',
      sentiment: 'down',
      comment: 'The evidence summary missed relevant context.',
      createdById: 'user_1',
    })
    expect(result.feedback).toMatchObject({
      id: 'feedback_1',
      sentiment: 'down',
      comment: 'The evidence summary missed relevant context.',
      analysisRunId: 'run_1',
    })
  })

  it('targets the current run pointer even when a newer completed audit run exists', async () => {
    readValidatedBody.mockImplementation(async (_event, parser) => parser({
      sentiment: 'up',
      analysisRunId: 'run_A',
    }))
    txSelect.mockReturnValue(lockedApplicationQuery([{ id: 'app_1', currentAnalysisRunId: 'run_A' }]))

    const result = await submitScoringFeedback({})

    const insertedValues = txInsert.mock.results[0]!.value.values.mock.calls[0]![0]
    expect(insertedValues.analysisRunId).toBe('run_A')
    expect(result.feedback.analysisRunId).toBe('run_A')
  })

  it('rejects stale feedback when the browser targets an older run', async () => {
    readValidatedBody.mockImplementation(async (_event, parser) => parser({
      sentiment: 'up',
      analysisRunId: 'old_run',
    }))

    await expect(submitScoringFeedback({})).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Scoring feedback target is stale. Refresh and try again.',
    })
    expect(txInsert).not.toHaveBeenCalled()
  })

  it('requires a current scoring run before accepting feedback', async () => {
    txSelect.mockReturnValue(lockedApplicationQuery([{ id: 'app_1', currentAnalysisRunId: null }]))

    await expect(submitScoringFeedback({})).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: 'Run scoring before leaving feedback.',
    })
    expect(txInsert).not.toHaveBeenCalled()
  })

  it('rejects run A after a concurrent scorer commits pointer B before the row lock is acquired', async () => {
    readValidatedBody.mockImplementation(async (_event, parser) => parser({
      sentiment: 'up',
      analysisRunId: 'run_A',
    }))
    txSelect.mockReturnValue(lockedApplicationQuery([{
      id: 'app_1',
      currentAnalysisRunId: 'run_B',
    }]))

    await expect(submitScoringFeedback({})).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Scoring feedback target is stale. Refresh and try again.',
    })

    expect(forUpdate).toHaveBeenCalledWith('update')
    expect(txInsert).not.toHaveBeenCalled()
  })
})
