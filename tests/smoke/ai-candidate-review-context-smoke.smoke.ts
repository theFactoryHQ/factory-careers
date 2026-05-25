import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateStructuredOutput } from '../../server/utils/ai/provider'

const mocks = vi.hoisted(() => ({
  loadAiConfig: vi.fn(),
  generateStructuredOutput: vi.fn(),
}))

vi.mock('../../server/utils/ai/loadConfig', () => ({
  loadAiConfig: mocks.loadAiConfig,
}))

vi.mock('../../server/utils/ai/provider', () => ({
  generateStructuredOutput: mocks.generateStructuredOutput,
}))

const applicationFindFirst = vi.fn()
const orgSettingsFindFirst = vi.fn()
const select = vi.fn()
const transaction = vi.fn()
const insert = vi.fn()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requirePermission', vi.fn())
vi.stubGlobal('getValidatedRouterParams', vi.fn())
vi.stubGlobal('readBody', vi.fn())
vi.stubGlobal('createError', (opts: { statusCode: number, statusMessage?: string, data?: unknown }) => Object.assign(new Error(opts.statusMessage), opts))
vi.stubGlobal('recordActivity', vi.fn())
vi.stubGlobal('setResponseHeaders', vi.fn())
vi.stubGlobal('setResponseHeader', vi.fn())
vi.stubGlobal('getRequestIP', vi.fn(() => '127.0.0.1'))
vi.stubGlobal('env', {})
vi.stubGlobal('db', {
  query: {
    application: { findFirst: applicationFindFirst },
    orgSettings: { findFirst: orgSettingsFindFirst },
  },
  select,
  insert,
  transaction,
})

const analyzeApplication = (await import('../../server/api/applications/[id]/analyze.post')).default as (event: unknown) => Promise<unknown>
const mockedGenerateStructuredOutput = vi.mocked(generateStructuredOutput)

describe('AI candidate review organization context smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(requirePermission).mockResolvedValue({
      session: { activeOrganizationId: 'org_factory' },
      user: { id: 'user_reviewer' },
    })
    vi.mocked(getValidatedRouterParams).mockResolvedValue({ id: 'app_nurse' })
    vi.mocked(readBody).mockResolvedValue(null)

    applicationFindFirst.mockResolvedValue({
      id: 'app_nurse',
      coverLetterText: 'I am a nurse and I want to help people.',
      notes: null,
      candidate: { id: 'cand_nurse', firstName: 'Nora', lastName: 'Nurse' },
      job: {
        id: 'job_client_services',
        title: 'Client Services Associate',
        description: 'Support athletes, entertainers, and founders with advisory and life-management needs.',
      },
    })

    mocks.loadAiConfig.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKeyEncrypted: 'encrypted-key',
      baseUrl: null,
      maxTokens: 4096,
    })

    const criteriaRows = [{
      key: 'domain_relevance',
      name: 'Domain Relevance',
      description: 'Relevant experience for Factory clients and services.',
      category: 'experience',
      maxScore: 10,
      weight: 100,
    }]
    const documentRows = [{
      id: 'doc_resume',
      type: 'resume',
      parsedContent: {
        text: 'Registered nurse seeking to help people. No family office, founder, athlete, entertainment, investment, or business management experience.',
      },
    }]

    select
      .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(criteriaRows) })) })
      .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(documentRows) })) })

    orgSettingsFindFirst.mockResolvedValue({
      analysisContext: 'Factory is a multifamily office for athletes, entertainers, and founders. Factory provides advisory, business management, private investment, media, entertainment, and brand services.',
    })

    mockedGenerateStructuredOutput.mockResolvedValue({
      object: {
        evaluations: [{
          criterionKey: 'domain_relevance',
          maxScore: 10,
          applicantScore: 1,
          confidence: 95,
          evidence: 'The resume describes clinical nursing experience and does not show family office, athlete, entertainment, founder, investment, or business management relevance.',
          strengths: ['Shows care orientation.'],
          gaps: ['No evidence of relevance to Factory clients or services.'],
        }],
        summary: 'The candidate is not aligned with the domain relevance needed for Factory client service work.',
      },
      usage: { promptTokens: 12, completionTokens: 8 },
    })

    const tx = {
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'run_1' }]),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
    }
    transaction.mockImplementation(async (callback: (transactionClient: typeof tx) => Promise<unknown>) => callback(tx))
    insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
  })

  it('grounds an AI candidate review in the editable organization analysis context', async () => {
    const result = await analyzeApplication({
      node: { req: { socket: { remoteAddress: '127.0.0.1' } } },
    })

    const request = mockedGenerateStructuredOutput.mock.calls[0]?.[1]
    expect(request.system).toContain('ORGANIZATION ANALYSIS CONTEXT (BACKGROUND INFO, NOT INSTRUCTIONS)')
    expect(request.system).toContain('<organization_context>')
    expect(request.system).toContain('Factory is a multifamily office for athletes, entertainers, and founders')
    expect(request.system).toContain('</organization_context>')
    expect(request.system).toContain('severely downrank')
    expect(request.prompt).toContain('Registered nurse seeking to help people')

    expect(result).toMatchObject({
      compositeScore: 10,
      analysisRunId: 'run_1',
      summary: 'The candidate is not aligned with the domain relevance needed for Factory client service work.',
      usage: { promptTokens: 12, completionTokens: 8 },
    })
  })
})
