import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('organization default salary pay period', () => {
  it('exposes a validated organization-level default in settings', () => {
    const settingsPage = readProjectFile('app/pages/dashboard/settings/index.vue')
    const orgSettingsSchema = readProjectFile('server/utils/schemas/orgSettings.ts')
    const getEndpoint = readProjectFile('server/api/org-settings/index.get.ts')
    const patchEndpoint = readProjectFile('server/api/org-settings/index.patch.ts')
    const migration = readProjectFile('server/database/migrations/0036_default_salary_unit.sql')
    const journal = readProjectFile('server/database/migrations/meta/_journal.json')

    expect(settingsPage).toContain('Default pay period')
    expect(settingsPage).toContain('defaultSalaryUnit')
    expect(settingsPage).toContain('SALARY_UNIT_OPTIONS')
    expect(orgSettingsSchema).toContain('defaultSalaryUnit: z.enum(SALARY_UNIT_VALUES).optional()')
    expect(getEndpoint).toContain('defaultSalaryUnit: settings?.defaultSalaryUnit ?? \'YEAR\'')
    expect(patchEndpoint).toContain('defaultSalaryUnit: body.defaultSalaryUnit ?? \'YEAR\'')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "default_salary_unit"')
    expect(journal).toContain('"tag": "0036_default_salary_unit"')
  })

  it('makes job pay period inherit the organization default instead of Not specified', () => {
    const applicationPage = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const jobSettingsPage = readProjectFile('app/pages/dashboard/jobs/[id]/settings.vue')

    expect(applicationPage).toContain('defaultSalaryUnit')
    expect(applicationPage).toContain("salaryUnit: 'YEAR'")
    expect(applicationPage).toContain('salaryUnit: j.salaryUnit ?? defaultSalaryUnit.value')
    expect(applicationPage).toContain(':options="SALARY_UNIT_OPTIONS"')
    expect(applicationPage).not.toContain('const salaryUnitOptions')
    expect(jobSettingsPage).not.toContain(':options="SALARY_UNIT_OPTIONS"')
  })
})
