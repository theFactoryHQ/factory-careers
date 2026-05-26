import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { updateJobSchema } from '../../server/utils/schemas/job'
import { updateOrgSettingsSchema } from '../../server/utils/schemas/orgSettings'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('scoring band settings integration', () => {
  const validBands = [
    { label: 'Low', minScore: 0, maxScore: 49, color: 'danger' },
    { label: 'High', minScore: 50, maxScore: 100, color: 'success' },
  ] as const

  it('accepts complete global and job scoring band fixtures', () => {
    expect(updateOrgSettingsSchema.parse({ scoringBands: validBands }).scoringBands).toEqual(validBands)
    expect(updateJobSchema.parse({ scoringBands: validBands }).scoringBands).toEqual(validBands)
    expect(updateJobSchema.parse({ scoringBands: null }).scoringBands).toBeNull()
  })

  it('rejects scoring band fixtures with gaps, overlaps, or missing 0-100 coverage', () => {
    const invalidFixtures = [
      [{ label: 'Starts late', minScore: 1, maxScore: 100, color: 'warning' }],
      [
        { label: 'Low', minScore: 0, maxScore: 49, color: 'danger' },
        { label: 'Gap', minScore: 51, maxScore: 100, color: 'success' },
      ],
      [
        { label: 'Low', minScore: 0, maxScore: 60, color: 'danger' },
        { label: 'Overlap', minScore: 60, maxScore: 100, color: 'success' },
      ],
      [{ label: 'Stops early', minScore: 0, maxScore: 99, color: 'neutral' }],
    ]

    for (const scoringBands of invalidFixtures) {
      expect(updateOrgSettingsSchema.safeParse({ scoringBands }).success).toBe(false)
      expect(updateJobSchema.safeParse({ scoringBands }).success).toBe(false)
    }
  })

  it('persists global defaults and job-specific overrides', () => {
    const appSchema = readProjectFile('server/database/schema/app.ts')
    const orgSettingsSchema = readProjectFile('server/utils/schemas/orgSettings.ts')
    const jobSchema = readProjectFile('server/utils/schemas/job.ts')
    const orgGet = readProjectFile('server/api/org-settings/index.get.ts')
    const orgPatch = readProjectFile('server/api/org-settings/index.patch.ts')
    const jobGet = readProjectFile('server/api/jobs/[id].get.ts')
    const jobPatch = readProjectFile('server/api/jobs/[id].patch.ts')
    const migration = readProjectFile('server/database/migrations/0045_scoring_bands.sql')
    const journal = readProjectFile('server/database/migrations/meta/_journal.json')

    expect(appSchema).toContain("scoringBands: jsonb('scoring_bands')")
    expect(appSchema).toContain("scoringBands: jsonb('scoring_bands').$type<ScoringBand[] | null>()")
    expect(orgSettingsSchema).toContain('scoringBands: scoringBandsSchema.optional()')
    expect(jobSchema).toContain('scoringBands: scoringBandsSchema.nullable().optional()')
    expect(orgGet).toContain('scoringBands: settings?.scoringBands ?? DEFAULT_SCORING_BANDS')
    expect(orgPatch).toContain('scoringBands: body.scoringBands ?? DEFAULT_SCORING_BANDS')
    expect(jobGet).toContain('scoringBands: true')
    expect(jobPatch).toContain('scoringBands: job.scoringBands')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "scoring_bands"')
    expect(migration).toContain('Unlikely Fit')
    expect(journal).toContain('"tag": "0045_scoring_bands"')
  })

  it('surfaces scoring bands in AI settings, job AI settings, and score displays', () => {
    const aiSettings = readProjectFile('app/pages/dashboard/settings/ai/index.vue')
    const jobAiSettings = readProjectFile('app/pages/dashboard/jobs/[id]/ai-analysis.vue')
    const scoreBreakdown = readProjectFile('app/components/ScoreBreakdown.vue')
    const drawer = readProjectFile('app/components/ApplicationDetailDrawer.vue')
    const scoresEndpoint = readProjectFile('server/api/applications/[id]/scores.get.ts')

    expect(aiSettings).toContain('ScoringBandsEditor')
    expect(aiSettings).toContain('mode="global"')
    expect(jobAiSettings).toContain('ScoringBandsEditor')
    expect(jobAiSettings).toContain('mode="job"')
    expect(scoreBreakdown).toContain('scoreBand')
    expect(drawer).toContain('scoreBand')
    expect(scoresEndpoint).toContain('const scoreBand = findScoringBand')
  })
})
