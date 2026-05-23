import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('job pipeline filter chips', () => {
  it('keeps the filter toggle the same height as the sort dropdown', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(source).toContain('flex h-8 min-h-8 w-full cursor-pointer items-center gap-1.5 rounded-md border px-2 py-0')
    expect(source).toContain('relative flex h-8 min-h-8 cursor-pointer items-center justify-center gap-1 rounded-md border px-2 py-0')
  })

  it('uses shared Factory chip styling for score and interview filters', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(source).toContain('ui-filter-chip relative flex h-8 shrink-0 cursor-pointer items-center px-2.5')
    expect(source).toContain('ui-filter-chip-active')
    expect(source).toContain('ui-filter-chip-inactive')
    expect(source).not.toContain('cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150')
  })
})
