import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

describe('ai-analysis stats usage period', () => {
  it('returns a database-aligned calendar window for hydration-stable charts', () => {
    const route = readFileSync(
      join(process.cwd(), 'server/api/ai-analysis/stats.get.ts'),
      'utf8',
    )

    expect(route).toContain('usagePeriod')
    expect(route).toContain('CURRENT_DATE')
    expect(route).toContain("INTERVAL '29 days'")
  })
})
