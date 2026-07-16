import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  loadApplicationResume,
  type ApplicationResumeDocument,
  type ApplicationResumeQuery,
  type ApplicationResumeQueryAdapter,
} from '../../server/utils/applicationResume'

type StoredResume = ApplicationResumeDocument & {
  organizationId: string
  candidateId: string
  applicationId: string | null
  createdAt: Date
}

function createAdapter(rows: StoredResume[]) {
  const queries: ApplicationResumeQuery[] = []
  const adapter: ApplicationResumeQueryAdapter = {
    async findResume(query) {
      queries.push(query)
      return rows
        .filter(row =>
          row.organizationId === query.organizationId
          && row.candidateId === query.candidateId
          && row.applicationId === query.applicationId,
        )
        .sort((left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime()
          || right.id.localeCompare(left.id),
        )[0] ?? null
    },
  }

  return { adapter, queries }
}

describe('application resume selection', () => {
  it('selects the resume associated with this application before a newer legacy resume', async () => {
    const associated = {
      id: 'resume-associated',
      parsedContent: { rawText: 'application resume' },
      organizationId: 'org-1',
      candidateId: 'candidate-1',
      applicationId: 'application-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }
    const { adapter, queries } = createAdapter([
      associated,
      {
        id: 'resume-legacy-newer',
        parsedContent: { rawText: 'legacy resume' },
        organizationId: 'org-1',
        candidateId: 'candidate-1',
        applicationId: null,
        createdAt: new Date('2026-07-01T00:00:00Z'),
      },
    ])

    await expect(loadApplicationResume(
      'org-1',
      'application-1',
      'candidate-1',
      adapter,
    )).resolves.toEqual(associated)
    expect(queries).toEqual([{
      organizationId: 'org-1',
      applicationId: 'application-1',
      candidateId: 'candidate-1',
      orderBy: ['createdAtDesc', 'idDesc'],
    }])
  })

  it('does not fall back when the associated resume exists but has unusable parsed content', async () => {
    const associated = {
      id: 'resume-associated-unparsed',
      parsedContent: null,
      organizationId: 'org-1',
      candidateId: 'candidate-1',
      applicationId: 'application-1',
      createdAt: new Date('2026-07-01T00:00:00Z'),
    }
    const { adapter, queries } = createAdapter([
      associated,
      {
        id: 'resume-legacy-parsed',
        parsedContent: { rawText: 'do not use me' },
        organizationId: 'org-1',
        candidateId: 'candidate-1',
        applicationId: null,
        createdAt: new Date('2026-07-02T00:00:00Z'),
      },
    ])

    await expect(loadApplicationResume(
      'org-1',
      'application-1',
      'candidate-1',
      adapter,
    )).resolves.toEqual(associated)
    expect(queries).toHaveLength(1)
  })

  it('falls back only to legacy resumes and chooses newest createdAt then highest id', async () => {
    const expected = {
      id: 'resume-z',
      parsedContent: { rawText: 'deterministic legacy resume' },
      organizationId: 'org-1',
      candidateId: 'candidate-1',
      applicationId: null,
      createdAt: new Date('2026-07-01T00:00:00Z'),
    }
    const { adapter, queries } = createAdapter([
      {
        id: 'resume-newest-other-application',
        parsedContent: { rawText: 'wrong application' },
        organizationId: 'org-1',
        candidateId: 'candidate-1',
        applicationId: 'application-2',
        createdAt: new Date('2026-07-03T00:00:00Z'),
      },
      {
        id: 'resume-a',
        parsedContent: { rawText: 'same timestamp, lower id' },
        organizationId: 'org-1',
        candidateId: 'candidate-1',
        applicationId: null,
        createdAt: new Date('2026-07-01T00:00:00Z'),
      },
      expected,
      {
        id: 'resume-older',
        parsedContent: { rawText: 'older legacy resume' },
        organizationId: 'org-1',
        candidateId: 'candidate-1',
        applicationId: null,
        createdAt: new Date('2026-06-01T00:00:00Z'),
      },
    ])

    await expect(loadApplicationResume(
      'org-1',
      'application-1',
      'candidate-1',
      adapter,
    )).resolves.toEqual(expected)
    expect(queries).toEqual([
      {
        organizationId: 'org-1',
        applicationId: 'application-1',
        candidateId: 'candidate-1',
        orderBy: ['createdAtDesc', 'idDesc'],
      },
      {
        organizationId: 'org-1',
        applicationId: null,
        candidateId: 'candidate-1',
        orderBy: ['createdAtDesc', 'idDesc'],
      },
    ])
  })

  it('uses the shared selector through the common manual and automatic analysis executor', () => {
    const analyzeRoute = readFileSync(join(process.cwd(), 'server/api/applications/[id]/analyze.post.ts'), 'utf8')
    const automaticScoring = readFileSync(join(process.cwd(), 'server/utils/ai/autoScore.ts'), 'utf8')
    const analysisExecutor = readFileSync(join(process.cwd(), 'server/utils/analyzeApplication.ts'), 'utf8')
    const expectedCall = 'loadApplicationResume(orgId, applicationId, app.candidate.id)'

    expect(analysisExecutor).toContain('loadApplicationResume(')
    expect(analysisExecutor).toContain('organizationId,')
    expect(analysisExecutor).toContain('applicationId,')
    expect(analysisExecutor).toContain('app.candidate.id,')
    expect(analyzeRoute).toContain('analyzeApplication({')
    expect(automaticScoring).toContain('analyzeApplication({')
    expect(automaticScoring).toContain('error instanceof AnalyzeApplicationError')
    expect(automaticScoring).toContain('throw error')
    expect(analyzeRoute).not.toContain(expectedCall)
    expect(automaticScoring).not.toContain(expectedCall)
  })
})
