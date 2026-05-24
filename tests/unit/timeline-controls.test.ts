import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('timeline controls', () => {
  it('matches search height and uses bordered filter chips', () => {
    const source = readProjectFile('app/pages/dashboard/timeline.vue')
    const filters = source.slice(
      source.indexOf('<!-- Search + filters -->'),
      source.indexOf('<!-- ─── Loading skeleton ─── -->'),
    )

    expect(filters).toContain('GooeySearchInput')
    expect(filters).toContain('ui-filter-chip inline-flex h-10 min-h-10')
    expect(filters).toContain('ui-filter-chip-active')
    expect(filters).toContain('ui-filter-chip-inactive')
    expect(filters).not.toContain('rounded-md px-2.5 py-2')
  })
})
