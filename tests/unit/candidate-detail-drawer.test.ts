import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('candidate detail drawer', () => {
  it('keeps application row schedule actions and status badges the same height', () => {
    const source = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const badge = readProjectFile('app/components/ApplicationStatusBadge.vue')

    expect(source).toContain('factory-toolbar-button inline-flex h-8 min-h-8 items-center gap-1 border')
    expect(source).toContain('<ApplicationStatusBadge :status="app.status" />')
    expect(badge).toContain('inline-flex h-8 min-h-8 shrink-0 items-center border')
  })
})
