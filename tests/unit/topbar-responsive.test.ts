import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('dashboard top bar responsiveness', () => {
  const source = readFileSync(join(process.cwd(), 'app/components/AppTopBar.vue'), 'utf8')

  it('delays full nav labels until there is room for the desktop actions', () => {
    expect(source).toContain('hidden min-[1500px]:inline')
    expect(source).toContain('min-[1500px]:hidden')
    expect(source).toContain('hidden min-[1800px]:inline')
    expect(source).toContain('min-[1800px]:hidden')
  })

  it('keeps the New Job CTA separated from collapsing nav items', () => {
    expect(source).toContain('flex shrink-0 items-center gap-1 pl-2 lg:gap-1.5 lg:pl-3 xl:pl-4')
    expect(source).toContain('factory-button-cta factory-button-premium mx-1 hidden h-9')
  })
})
