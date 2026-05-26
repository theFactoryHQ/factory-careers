import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('scoring band settings integration', () => {
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
