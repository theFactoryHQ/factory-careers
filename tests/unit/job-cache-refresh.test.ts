import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('job cache refresh', () => {
  it('keeps the topbar job status cache responsive after job mutations', () => {
    const topbar = readProjectFile('app/components/AppTopBar.vue')
    const useJob = readProjectFile('app/composables/useJob.ts')

    expect(topbar).toContain("key: 'sidebar-jobs-list'")
    expect(useJob).toContain("useNuxtData<{ data: Array<Record<string, unknown>> }>('sidebar-jobs-list')")
    expect(useJob).toContain('syncJobListCache(updated)')
    expect(useJob).toMatch(/refreshNuxtData\('sidebar-jobs-list'\)/)
  })
})
