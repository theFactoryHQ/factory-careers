import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('job auto-score default', () => {
  it('defaults auto-score on for new and unconfigured jobs', () => {
    const schema = readProjectFile('server/utils/schemas/job.ts')
    const jobSchema = readProjectFile('server/database/schema/app.ts')
    const newJobPage = readProjectFile('app/pages/dashboard/jobs/new.vue')
    const settingsPage = readProjectFile('app/pages/dashboard/jobs/[id]/settings.vue')
    const aiPage = readProjectFile('app/pages/dashboard/jobs/[id]/ai-analysis.vue')

    expect(schema).toContain('autoScoreOnApply: z.boolean().optional().default(true)')
    expect(jobSchema).toContain("autoScoreOnApply: boolean('auto_score_on_apply').notNull().default(true)")
    expect(newJobPage).toContain('const autoScoreOnApply = ref(true)')
    expect(newJobPage).toContain('autoScoreOnApply.value = true')
    expect(settingsPage).toContain('autoScoreOnApply: true')
    expect(settingsPage).toContain('autoScoreOnApply: j.autoScoreOnApply ?? true')
    expect(aiPage).toContain('(j as any).autoScoreOnApply ?? true')
  })

  it('migrates the database default to enabled', () => {
    const migration = readProjectFile('server/database/migrations/0037_auto_score_default_on.sql')

    expect(migration).toContain('ALTER TABLE "job" ALTER COLUMN "auto_score_on_apply" SET DEFAULT true')
    expect(migration).toContain('UPDATE "job" SET "auto_score_on_apply" = true')
  })
})
