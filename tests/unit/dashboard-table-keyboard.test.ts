import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('dashboard table keyboard affordances', () => {
  it('keeps candidate tables off pointer-only row activation', () => {
    const candidates = readProjectFile('app/pages/dashboard/candidates/index.vue')
    const jobCandidates = readProjectFile('app/pages/dashboard/jobs/[id]/candidates.vue')

    for (const source of [candidates, jobCandidates]) {
      expect(source).not.toMatch(/<tr[^>]*@click=/)
      expect(source).toContain(':aria-sort="getSortAria(')
      expect(source).toContain('getSortButtonLabel')
    }

    expect(candidates).toContain(':aria-label="`Open candidate ${formatCandidateName(c)}`"')
    expect(jobCandidates).toContain(':aria-label="`Open application for ${formatPersonName(app.candidateFirstName, app.candidateLastName)}`"')
  })
})
