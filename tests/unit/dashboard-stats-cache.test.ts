import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('dashboard stats cache', () => {
  const source = readFileSync(join(process.cwd(), 'server/api/dashboard/stats.get.ts'), 'utf8')

  it('varies by cookie so the cached handler preserves auth headers', () => {
    expect(source).toContain("varies: ['cookie']")
  })
})
