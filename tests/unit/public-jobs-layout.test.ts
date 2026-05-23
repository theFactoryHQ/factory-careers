import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('public jobs layout', () => {
  it('pins the public careers header while browsing jobs', () => {
    const source = readProjectFile('app/pages/jobs/index.vue')
    const layout = readProjectFile('app/layouts/public.vue')

    expect(layout).toContain("route.meta.publicPinnedNav ? 'sticky top-0 z-50' : ''")
    expect(source).toContain('publicPinnedNav: true')
  })
})
