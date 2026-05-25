import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('organization analysis context settings', () => {
  it('exposes editable organization analysis context through settings', () => {
    const aiSettingsPage = readProjectFile('app/pages/dashboard/settings/ai/index.vue')
    const orgSettingsComposable = readProjectFile('app/composables/useOrgSettings.ts')
    const orgSettingsSchema = readProjectFile('server/utils/schemas/orgSettings.ts')
    const getEndpoint = readProjectFile('server/api/org-settings/index.get.ts')
    const patchEndpoint = readProjectFile('server/api/org-settings/index.patch.ts')
    const migration = readProjectFile('server/database/migrations/0041_org_analysis_context.sql')
    const journal = readProjectFile('server/database/migrations/meta/_journal.json')

    expect(aiSettingsPage).toContain('Analysis context')
    expect(aiSettingsPage).toContain('localAnalysisContext')
    expect(aiSettingsPage).toContain('analysisContext: localAnalysisContext.value')
    expect(orgSettingsComposable).toContain('analysisContext')
    expect(orgSettingsSchema).toContain('analysisContext: z.string().trim().max(4000).optional()')
    expect(getEndpoint).toContain("analysisContext: settings?.analysisContext ?? ''")
    expect(patchEndpoint).toContain('analysisContext: body.analysisContext ?? \'\'')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "analysis_context"')
    expect(journal).toContain('"tag": "0041_org_analysis_context"')
  })

  it('keeps Factory-specific business text out of the scorer implementation', () => {
    const scorer = readProjectFile('server/utils/ai/scoring.ts')

    expect(scorer).not.toContain('Factory is a multifamily office')
    expect(scorer).not.toContain('athletes, entertainers, and founders')
    expect(scorer).toContain('organizationAnalysisContext')
  })
})
