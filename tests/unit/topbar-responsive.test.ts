import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('dashboard top bar responsiveness', () => {
  const source = readFileSync(join(process.cwd(), 'app/components/AppTopBar.vue'), 'utf8')
  const backLinkSource = readFileSync(join(process.cwd(), 'app/components/AppBackLink.vue'), 'utf8')

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

  it('temporarily hides the desktop more actions menu pending a Factory refactor', () => {
    expect(source).toContain('const showFactoryMoreActions = false')
    expect(source).toMatch(/v-if="showFactoryMoreActions"[\s\S]*title="More options"/)
  })

  it('uses bordered Factory controls for job context sub-navigation tabs', () => {
    expect(source).toContain('factory-job-subnav-tab')
    expect(source).toContain('factory-job-subnav-tab-active')
    expect(source).toContain('factory-job-subnav-tab-inactive')
    expect(source).not.toContain('border-transparent text-white/50')
  })

  it('renders the job context back link as icon-only', () => {
    expect(source).toContain('aria-label="All jobs"')
    expect(source).toContain('title="All jobs"')
    expect(source).not.toMatch(/<ChevronLeft class="size-3\.5" \/>\s*All Jobs/)
  })

  it('uses white-fill hover treatment for dashboard back links', () => {
    expect(backLinkSource).toContain('border border-transparent')
    expect(backLinkSource).toContain('hover:border-white hover:bg-white hover:text-black')
    expect(backLinkSource).not.toContain('border border-white/16')
    expect(backLinkSource).not.toContain('hover:border-brand-500')
  })
})
