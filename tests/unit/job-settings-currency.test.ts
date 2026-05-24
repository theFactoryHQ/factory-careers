import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('job settings salary currency', () => {
  it('uses a validated currency list and defaults to USD in the settings form', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/settings.vue')

    expect(source).toContain('CURRENCY_OPTIONS')
    expect(source).toContain("salaryCurrency: 'USD'")
    expect(source).toContain("salaryCurrency: j.salaryCurrency ?? 'USD'")
    expect(source).toContain('z.enum(CURRENCY_VALUES)')
    expect(source).toContain('id="settings-currency"')
    expect(source).toContain(':options="CURRENCY_OPTIONS"')
    expect(source).not.toContain('placeholder="e.g. USD, EUR, NOK"')
  })

  it('validates salary currency in shared server schemas', () => {
    const schema = readProjectFile('server/utils/schemas/job.ts')

    expect(schema).toContain('CURRENCY_VALUES')
    expect(schema).toContain('salaryCurrency: z.enum(CURRENCY_VALUES).nullable().optional()')
  })
})
