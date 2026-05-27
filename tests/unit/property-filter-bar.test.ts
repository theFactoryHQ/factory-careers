import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('property filter picker', () => {
  it('uses Factory dropdown styling for the add-filter picker', () => {
    const source = readProjectFile('app/components/PropertyFilterBar.vue')

    expect(source).toContain('factory-filter-dropdown-trigger')
    expect(source).toContain('factory-filter-dropdown-menu')
    expect(source).toContain('factory-filter-dropdown-option')
    expect(source).toContain('useFloatingMenu')
    expect(source).toContain('factory-dashboard-portal')
  })
})
