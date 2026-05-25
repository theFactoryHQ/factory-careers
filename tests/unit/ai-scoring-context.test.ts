import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateCriteriaFromDescription, scoreApplication } from '../../server/utils/ai/scoring'
import { generateStructuredOutput } from '../../server/utils/ai/provider'

vi.mock('../../server/utils/ai/provider', () => ({
  generateStructuredOutput: vi.fn(),
}))

const providerConfig = {
  provider: 'openai' as const,
  model: 'gpt-4.1-mini',
  apiKeyEncrypted: 'encrypted-key',
}

const mockedGenerateStructuredOutput = vi.mocked(generateStructuredOutput)

describe('AI scoring organization analysis context', () => {
  beforeEach(() => {
    mockedGenerateStructuredOutput.mockReset()
  })

  it('grounds generated criteria in the organization-provided context before deriving role requirements', async () => {
    mockedGenerateStructuredOutput.mockResolvedValueOnce({
      object: {
        criteria: [{
          key: 'domain_relevance',
          name: 'Domain Relevance',
          description: 'Relevant experience serving Factory clients.',
          category: 'experience',
          maxScore: 10,
          suggestedWeight: 80,
        }],
      },
      usage: { promptTokens: 1, completionTokens: 1 },
    })

    const organizationAnalysisContext = 'Acme Studio is a family office for athletes and entertainers with advisory and brand-management services.'

    await generateCriteriaFromDescription(
      providerConfig,
      'Client Services Associate',
      'Support high-touch clients across personal operations and business matters.',
      { organizationAnalysisContext },
    )

    const request = mockedGenerateStructuredOutput.mock.calls[0]?.[1]
    expect(request.system).toContain('ORGANIZATION ANALYSIS CONTEXT')
    expect(request.system).toContain(organizationAnalysisContext)
    expect(request.system).not.toContain('Factory is a multifamily office')
  })

  it('grounds candidate scoring in the organization context without hardcoding Factory', async () => {
    mockedGenerateStructuredOutput.mockResolvedValueOnce({
      object: {
        evaluations: [{
          criterionKey: 'domain_relevance',
          maxScore: 10,
          applicantScore: 2,
          confidence: 90,
          evidence: 'The resume describes clinical nursing experience.',
          strengths: ['Shows care orientation.'],
          gaps: ['No evidence of relevance to Factory clients or services.'],
        }],
        summary: 'The candidate is not aligned with Factory client-service needs.',
      },
      usage: { promptTokens: 1, completionTokens: 1 },
    })

    const organizationAnalysisContext = 'Acme Studio is a family office for athletes and entertainers with advisory and brand-management services.'

    await scoreApplication(providerConfig, {
      jobTitle: 'Client Services Associate',
      jobDescription: 'Support athletes, entertainers, and founders with advisory and life-management needs.',
      criteria: [{
        key: 'domain_relevance',
        name: 'Domain Relevance',
        description: 'Relevant experience for Factory clients and services.',
        category: 'experience',
        maxScore: 10,
        weight: 100,
      }],
      resumeText: 'Registered nurse seeking to help people. No family office, founder, athlete, entertainment, investment, or business management experience.',
      organizationAnalysisContext,
    })

    const request = mockedGenerateStructuredOutput.mock.calls[0]?.[1]
    expect(request.system).toContain('ORGANIZATION ANALYSIS CONTEXT')
    expect(request.system).toContain(organizationAnalysisContext)
    expect(request.system).not.toContain('Factory is a multifamily office')
    expect(request.system).toContain('severely downrank')
    expect(request.system).toContain('general desire to help')
  })
})
