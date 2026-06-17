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

  it('shows the desktop more actions menu as a keyboard-operable Factory menu', () => {
    expect(source).not.toContain('const showFactoryMoreActions = false')
    expect(source).toContain('title="More options"')
    expect(source).toContain('aria-label="More actions"')
    expect(source).toContain('aria-controls="topbar-more-actions-menu"')
    expect(source).toContain('role="menu"')
    expect(source).toContain('useMenuButton')
  })

  it('keeps the collapsed desktop more navigation menu keyboard-operable', () => {
    expect(source).toContain('aria-label="More navigation"')
    expect(source).toContain('aria-controls="topbar-more-nav-menu"')
    expect(source).toContain('moreNavMenu.onTriggerKeydown')
    expect(source).toContain('moreNavMenu.onMenuKeydown')
  })

  it('uses bordered Factory controls for job context sub-navigation tabs', () => {
    expect(source).toContain('factory-job-subnav-tab')
    expect(source).toContain('factory-job-subnav-tab-active')
    expect(source).toContain('factory-job-subnav-tab-inactive')
    expect(source).not.toContain('border-transparent text-white/50')
  })

  it('keeps the job application form tab label compact', () => {
    expect(source).toContain("{ label: 'Application', to: `${base}/application-form`")
    expect(source).not.toContain("{ label: 'Application Form', to: `${base}/application-form`")
  })

  it('renders the job context back link as icon-only', () => {
    expect(source).toContain('aria-label="All jobs"')
    expect(source).toContain('title="All jobs"')
    expect(source).not.toMatch(/<ChevronLeft class="size-3\.5" \/>\s*All Jobs/)
  })

  it('stacks mobile job context with a labeled back link above job tabs', () => {
    expect(source).toContain('factory-job-mobile-context')
    expect(source).toContain('factory-job-mobile-back')
    expect(source).toContain('Back to jobs')
    expect(source).toContain('lg:hidden')
    expect(source).toContain('hidden lg:flex size-8')
  })

  it('uses white-fill hover treatment for dashboard back links', () => {
    expect(backLinkSource).toContain('border border-transparent')
    expect(backLinkSource).toContain('hover:border-white hover:bg-white hover:text-black')
    expect(backLinkSource).not.toContain('border border-white/16')
    expect(backLinkSource).not.toContain('hover:border-brand-500')
  })

  it('keeps mobile navigation in the hamburger menu, not the user menu', () => {
    const userDropdown = source.match(/<!-- User dropdown -->[\s\S]*?<!-- Mobile hamburger -->/)?.[0] ?? ''
    const mobileNav = source.match(/<!-- Mobile navigation menu -->[\s\S]*?<!-- Get Started CTA/)?.[0] ?? ''

    expect(userDropdown).not.toContain('v-for="item in navItems"')
    expect(userDropdown).not.toContain('Mobile-only items')
    expect(mobileNav).toContain('v-for="item in navItems"')
  })

  it('offers a user-menu link back to the public careers homepage', () => {
    const userDropdown = source.match(/<!-- User dropdown -->[\s\S]*?<!-- Mobile hamburger -->/)?.[0] ?? ''
    const signOutIndex = userDropdown.indexOf('Sign out')
    const careersHomeIndex = userDropdown.indexOf('Careers homepage')

    expect(userDropdown).toContain('id="topbar-user-menu"')
    expect(careersHomeIndex).toBeGreaterThan(-1)
    expect(signOutIndex).toBeGreaterThan(careersHomeIndex)
    expect(userDropdown).toContain(':to="localePath(\'/\')"')
    expect(userDropdown).toContain('@click="userMenu.closeMenu()"')
  })
})
