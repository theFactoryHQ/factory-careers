import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const componentPath = join(process.cwd(), 'app/components/GooeySearchInput.vue')
const dashboardCssPath = join(process.cwd(), 'app/assets/css/main.css')

describe('GooeySearchInput component source', () => {
  const source = readFileSync(componentPath, 'utf8')

  it('exposes the planned search input API and emits v-model updates', () => {
    expect(source).toContain('defineProps')
    expect(source).toContain('defineEmits')
    expect(source).toContain('update:modelValue')
    expect(source).toContain('type="search"')
    expect(source).toContain('placeholder')
    expect(source).toContain('ariaLabel')
  })

  it('includes the gooey SVG filter with a unique Vue id', () => {
    expect(source).toContain('useId()')
    expect(source).toContain('<filter')
    expect(source).toContain('feGaussianBlur')
    expect(source).toContain('feColorMatrix')
    expect(source).toContain('feBlend')
  })

  it('supports clear and Escape keyboard behavior', () => {
    expect(source).toContain('aria-label="Clear search"')
    expect(source).toContain('clearValue')
    expect(source).toContain('handleKeydown')
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain('inputRef.value?.blur()')
    expect(source).toContain('inputRef.value?.focus()')
    expect(source).not.toContain('inputRef?.focus()')
  })

  it('reserves input padding for clear and trailing controls', () => {
    expect(source).toContain('useSlots')
    expect(source).toContain('const slots = useSlots()')
    expect(source).toContain('if (currentValue.value && props.showClear) return sizeConfig.value.clearWidth')
    expect(source).toContain('if (slots.trailing) return sizeConfig.value.clearWidth')
  })

  it('keeps the Factory search skin square and border-led', () => {
    const dashboardHoverRule = source.match(/:global\(\.factory-dashboard-shell \.gooey-search-surface:hover \.gooey-search-outline\),[\s\S]*?:global\(\.factory-dashboard-portal \.gooey-search-surface:hover \.gooey-search-outline\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    const dashboardFieldRule = source.match(/:global\(\.factory-dashboard-shell \.gooey-search-surface \.gooey-search-field\),[\s\S]*?:global\(\.factory-dashboard-portal \.gooey-search-surface \.gooey-search-field\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    const dashboardFieldFocusRule = source.match(/:global\(\.factory-dashboard-shell \.gooey-search-surface \.gooey-search-field:focus\),[\s\S]*?:global\(\.factory-dashboard-portal \.gooey-search-surface \.gooey-search-field:focus\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    const dashboardSurfaceFocusRule = source.match(/:global\(\.factory-dashboard-shell \.gooey-search-surface:focus-within\),[\s\S]*?:global\(\.factory-dashboard-portal \.gooey-search-surface:focus-within\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    const dashboardInteractiveFocusRule = source.match(/:global\(\.factory-dashboard-shell \.gooey-search-surface :is\(\.gooey-search-field, \.gooey-search-trigger, \.gooey-search-clear\):focus\),[\s\S]*?:global\(\.factory-dashboard-portal \.gooey-search-surface :is\(\.gooey-search-field, \.gooey-search-trigger, \.gooey-search-clear\):focus\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    const dashboardFilteredBubblesRule = source.match(/:global\(\.factory-dashboard-shell \.gooey-search-surface \.gooey-search-bubbles\),[\s\S]*?:global\(\.factory-dashboard-portal \.gooey-search-surface \.gooey-search-bubbles\) \{([\s\S]*?)\n\}/)?.[1] ?? ''

    expect(source).toContain('border-radius: 0')
    expect(source).toContain('background: transparent !important')
    expect(source).toContain('background: #050505 !important')
    expect(source).toContain('border-color: var(--ui-border-strong) !important')
    expect(source).toContain('border-color: var(--color-brand-500) !important')
    expect(source).toContain('box-shadow: none')
    expect(source).toContain('color: rgb(255 255 255 / 0.72) !important')
    expect(dashboardFieldRule).toContain('border: 0 !important')
    expect(dashboardFieldRule).toContain('background-color: transparent !important')
    expect(dashboardFieldRule).toContain('box-shadow: none !important')
    expect(dashboardFieldFocusRule).toContain('box-shadow: none !important')
    expect(dashboardSurfaceFocusRule).toContain('outline: none !important')
    expect(dashboardSurfaceFocusRule).toContain('box-shadow: none !important')
    expect(dashboardInteractiveFocusRule).toContain('outline: none !important')
    expect(dashboardInteractiveFocusRule).toContain('box-shadow: none !important')
    expect(dashboardFilteredBubblesRule).toContain('filter: none !important')
    expect(dashboardHoverRule).toContain('border-color: var(--ui-border-strong) !important')
    expect(dashboardHoverRule).not.toContain('#ffffff')
    expect(source).not.toContain('gooey-search-outline factory-toolbar-button')
    expect(source).not.toMatch(/:global\(\.factory-dashboard-(?:shell|portal)\) \.gooey-search/)
    expect(source).not.toContain('ResizeObserver')
    expect(source).not.toContain('parentElement')
    expect(source).not.toContain('border-radius: 0.5rem')
    expect(source).not.toContain('background: var(--color-surface-900)')
    expect(source).not.toContain('border-color: rgb(255 255 255 / 0.18) !important')
    expect(source).not.toContain('border-color: rgb(255 255 255 / 0.24) !important')
    expect(source).not.toContain('box-shadow: 0 0 0 3px color-mix')
    expect(source).not.toContain('box-shadow: 0 1px 2px')
  })
})

describe('search bar call sites', () => {
  const searchCallSites = [
    'app/pages/jobs/index.vue',
    'app/pages/dashboard/jobs/index.vue',
    'app/pages/dashboard/jobs/[id]/index.vue',
    'app/pages/dashboard/interviews/index.vue',
    'app/pages/dashboard/timeline.vue',
    'app/pages/dashboard/settings/members.vue',
    'app/components/ApplicationLinkModal.vue',
    'app/pages/onboarding/create-org.vue',
  ]

  it('uses the shared GooeySearchInput at every known visible search location', () => {
    for (const relativePath of searchCallSites) {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8')

      expect(source, relativePath).toContain('<GooeySearchInput')
      expect(source, relativePath).not.toMatch(/<Search[\s\S]{0,220}<input/)
      expect(source, relativePath).not.toMatch(/<input[\s\S]{0,220}<Search/)
    }
  })

  it('keeps dashboard toolbar search inputs bounded so sibling controls stay visible', () => {
    const dashboardToolbarSearches = [
      'app/pages/dashboard/jobs/index.vue',
      'app/pages/dashboard/interviews/index.vue',
      'app/pages/dashboard/timeline.vue',
    ]

    for (const relativePath of dashboardToolbarSearches) {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8')
      expect(source, relativePath).toMatch(/<GooeySearchInput[\s\S]*class="[^"]*min-w-0[^"]*flex-1[^"]*sm:max-w-sm/)
    }

    const sharedToolbar = readFileSync(join(process.cwd(), 'app/components/DashboardListToolbar.vue'), 'utf8')
    expect(sharedToolbar).toMatch(/<GooeySearchInput[\s\S]*class="[^"]*min-w-0[^"]*flex-1[^"]*sm:max-w-sm/)

    for (const relativePath of [
      'app/pages/dashboard/candidates/index.vue',
      'app/pages/dashboard/applications/index.vue',
    ]) {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8')
      expect(source, relativePath).toContain('<DashboardListToolbar')
    }
  })

  it('keeps the public jobs search aligned to 40px toolbar controls', () => {
    const source = readFileSync(join(process.cwd(), 'app/pages/jobs/index.vue'), 'utf8')
    const publicJobsSearch = source.match(/<GooeySearchInput[\s\S]*?\/>/)?.[0] ?? ''
    const typeDropdownButton = source.match(/<button[\s\S]*aria-haspopup="listbox"[\s\S]*?>/)?.[0] ?? ''

    expect(publicJobsSearch).toContain('size="md"')
    expect(publicJobsSearch).not.toContain('size="lg"')
    expect(typeDropdownButton).toContain('h-10 min-h-10')
    expect(typeDropdownButton).toContain('py-0')
    expect(typeDropdownButton).not.toContain('py-3')
  })
})

describe('dashboard global search focus cascade', () => {
  const source = readFileSync(dashboardCssPath, 'utf8')

  it('keeps dashboard-wide focus overrides off GooeySearchInput internals', () => {
    expect(source).toMatch(/:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) :is\(input:not\(\.gooey-search-field\), textarea, select\) \{/)
    expect(source).toMatch(/:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) :is\(input:not\(\.gooey-search-field\), textarea, select\)::placeholder \{/)
    expect(source).toMatch(/:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) :is\(input:not\(\.gooey-search-field\), textarea, select\):focus \{/)
    expect(source).toMatch(/:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) :is\(button:not\(\.gooey-search-trigger\):not\(\.gooey-search-clear\), a\):focus-visible \{/)
    expect(source).not.toMatch(/:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) :is\(input, textarea, select\):focus/)
    expect(source).not.toMatch(/:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) :is\(button, a\):focus-visible/)
  })
})
