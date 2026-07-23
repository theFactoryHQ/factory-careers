import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('candidate cache refresh', () => {
  it('invalidates filtered candidate list caches after detail mutations', () => {
    const useCandidate = readProjectFile('app/composables/useCandidate.ts')
    const useCandidates = readProjectFile('app/composables/useCandidates.ts')

    expect(useCandidates).toContain('export function candidatesListKey')
    expect(useCandidates).toContain('candidatesListKey(query.value)')
    expect(useCandidates).toContain('getSwrCachedData')
    expect(useCandidate).toContain("key.startsWith('candidates-')")
    expect(useCandidate).toContain('getSwrCachedData')
    expect(useCandidate).not.toContain("refreshNuxtData('candidates')")
  })
})
