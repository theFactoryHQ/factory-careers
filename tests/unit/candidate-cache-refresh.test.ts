import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('candidate cache refresh', () => {
  it('invalidates filtered candidate list caches after detail mutations', () => {
    const useCandidate = readProjectFile('app/composables/useCandidate.ts')
    const useCandidates = readProjectFile('app/composables/useCandidates.ts')

    expect(useCandidates).toContain('`candidates-${JSON.stringify(query.value)}`')
    expect(useCandidate).toContain("key.startsWith('candidates-')")
    expect(useCandidate).not.toContain("refreshNuxtData('candidates')")
  })
})