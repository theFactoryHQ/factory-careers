import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('built-in applicant location', () => {
  it('collects country and state as required built-in fields on the public application form', () => {
    const source = readProjectFile('app/pages/jobs/[slug]/apply.vue')

    expect(source).toContain('COUNTRY_OPTIONS')
    expect(source).toContain('US_STATE_OPTIONS')
    expect(source).toContain("country: 'United States'")
    expect(source).toContain("state: ''")
    expect(source).toContain('v-model="form.country"')
    expect(source).toContain('v-model="form.state"')
    expect(source).toContain("errors.value.country = 'Country is required'")
    expect(source).toContain("errors.value.state = 'State is required'")
    expect(source).toContain("formData.append('country'")
    expect(source).toContain("formData.append('state'")
  })

  it('validates and persists location fields during public application submission', () => {
    const schema = readProjectFile('server/utils/schemas/publicApplication.ts')
    const handler = readProjectFile('server/api/public/jobs/[slug]/apply.post.ts')
    const dbSchema = readProjectFile('server/database/schema/app.ts')

    expect(schema).toContain('COUNTRY_VALUES')
    expect(schema).toContain('US_STATE_VALUES')
    expect(schema).toContain('country: z.enum(COUNTRY_VALUES')
    expect(schema).toContain('state: z.enum(US_STATE_VALUES')

    expect(handler).toContain('let country: string')
    expect(handler).toContain('let state: string')
    expect(handler).toContain('country = validated.country')
    expect(handler).toContain('state = validated.state')
    expect(handler).toContain('country: true')
    expect(handler).toContain('state: true')
    expect(handler).toContain('country,')
    expect(handler).toContain('state,')

    expect(dbSchema).toContain("country: text('country')")
    expect(dbSchema).toContain("state: text('state')")
  })

  it('repairs deployed databases that missed the candidate location migration', () => {
    const migration = readProjectFile('server/database/migrations/0049_candidate_location_repair.sql')
    const journal = readProjectFile('server/database/migrations/meta/_journal.json')

    expect(migration).toContain('ALTER TABLE "candidate" ADD COLUMN IF NOT EXISTS "country" text')
    expect(migration).toContain('ALTER TABLE "candidate" ADD COLUMN IF NOT EXISTS "state" text')
    expect(journal).toContain('"tag": "0049_candidate_location_repair"')
  })

  it('keeps readiness false when required candidate location columns are missing', () => {
    const readiness = readProjectFile('server/api/readyz.get.ts')

    expect(readiness).toContain('information_schema.columns')
    expect(readiness).toContain("column_name IN ('country', 'state')")
    expect(readiness).toContain('count(*) = 2')
  })

  it('keeps the legacy location prompt out of custom questions', () => {
    const seed = readProjectFile('server/scripts/seed-factory.ts')
    const publicJob = readProjectFile('server/api/public/jobs/[slug].get.ts')
    const publicApply = readProjectFile('server/api/public/jobs/[slug]/apply.post.ts')
    const dashboardQuestions = readProjectFile('server/api/jobs/[id]/questions/index.get.ts')

    expect(seed).not.toContain('Where are you based?')
    expect(publicJob).toContain('isBuiltInLocationQuestion')
    expect(publicApply).toContain('isBuiltInLocationQuestion')
    expect(dashboardQuestions).toContain('isBuiltInLocationQuestion')
  })
})
