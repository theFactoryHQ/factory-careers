import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('candidate quick notes', () => {
  it('uses the shared dashed add-note empty state', () => {
    const source = readProjectFile('app/pages/dashboard/candidates/index.vue')

    expect(source).toContain('border border-dashed border-white/12 bg-black')
    expect(source).toContain('Add Notes')
    expect(source).not.toContain('Add note…')
    expect(source).not.toContain('No notes yet.')
  })

  it('vertically centers every candidate table cell', () => {
    const source = readProjectFile('app/pages/dashboard/candidates/index.vue')

    expect(source).toContain('[&>td]:align-middle')
    expect(source).not.toContain('[&>td]:align-top')
    expect(source).not.toContain('w-52 align-top')
    expect(source).not.toContain('text-white/60 align-top')
  })
})
