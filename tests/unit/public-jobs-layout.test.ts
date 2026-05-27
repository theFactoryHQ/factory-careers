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

  it('uses the same centered max width for the public header and content', () => {
    const layout = readProjectFile('app/layouts/public.vue')

    expect(layout).toContain("const publicContainerClass = 'factory-layout-container mx-auto max-w-screen-2xl'")
    expect(layout).toContain('`${publicContainerClass} flex h-16 items-center justify-between`')
    expect(layout).toContain('`${publicContainerClass} pb-10 pt-0 sm:pb-14`')
    expect(layout).toContain('`${publicContainerClass} py-10 sm:py-14`')
  })
})
