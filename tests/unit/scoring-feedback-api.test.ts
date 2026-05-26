import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScoringFeedbackSchema } from '../../server/utils/schemas/scoring'

const applicationFindFirst = vi.fn()
const select = vi.fn()
const insert = vi.fn()
const readValidatedBody = vi.fn()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requirePermission', vi.fn())
vi.stubGlobal('getValidatedRouterParams', vi.fn())
vi.stubGlobal('readValidatedBody', readValidatedBody)
vi.stubGlobal('createError', (opts: { statusCode: number, statusMessage?: string }) => Object.assign(new Error(opts.statusMessage), opts))
vi.stubGlobal('db', {
  query: {
    application: { findFirst: applicationFindFirst },
  },
  select,
  insert,
})

const submitScoringFeedback = (await import('../../server/api/applications/[id]/scoring-feedback.post')).default as (event: unknown) => Promise<any>

function latestRunQuery(rows: Array<{ id: string }>) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(rows),
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
    applicationFindFirst.mockResolvedValue({ id: 'app_1' })
    readValidatedBody.mockImplementation(async (_event, parser) => parser({
      sentiment: 'down',
      analysisRunId: 'run_1',
      comment: 'The evidence summary missed relevant context.',
    }))
    select.mockReturnValue(latestRunQuery([{ id: 'run_1' }]))
    insert.mockReturnValue({
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
  })

  it('requires comments for thumbs-down feedback', () => {
    expect(createScoringFeedbackSchema.safeParse({ sentiment: 'down', comment: '' }).success).toBe(false)
    expect(createScoringFeedbackSchema.safeParse({ sentiment: 'up' }).success).toBe(true)
  })

  it('stores feedback on the latest completed scoring run', async () => {
    const result = await submitScoringFeedback({})

    expect(insert).toHaveBeenCalledTimes(1)
    const insertedValues = insert.mock.results[0]!.value.values.mock.calls[0]![0]
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

  it('rejects stale feedback when the browser targets an older run', async () => {
    readValidatedBody.mockImplementation(async (_event, parser) => parser({
      sentiment: 'up',
      analysisRunId: 'old_run',
    }))

    await expect(submitScoringFeedback({})).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Scoring feedback target is stale. Refresh and try again.',
    })
    expect(insert).not.toHaveBeenCalled()
  })
})
