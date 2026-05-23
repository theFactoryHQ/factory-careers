import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('job application overview notes', () => {
  it('uses the full application notes empty-state structure', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(source).toContain('currentSummary.notes')
    expect(source).toContain('border border-dashed border-white/12 bg-black')
    expect(source).toContain('No notes yet.')
    expect(source).toContain('Add Notes')
    expect(source).not.toContain("currentSummary.notes || 'No notes yet.'")
  })
})
