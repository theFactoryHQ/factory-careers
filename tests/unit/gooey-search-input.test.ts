import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const componentPath = join(process.cwd(), 'app/components/GooeySearchInput.vue')

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
  })

  it('keeps the Factory search skin square and border-led', () => {
    expect(source).toContain('border-radius: 0')
    expect(source).toContain('gooey-search-outline factory-toolbar-button')
    expect(source).toContain('background: transparent !important')
    expect(source).toContain('border-color: #ffffff !important')
    expect(source).toContain('border-color: var(--color-brand-500) !important')
    expect(source).toContain('box-shadow: none')
    expect(source).toContain('color: rgb(255 255 255 / 0.72) !important')
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
    'app/pages/dashboard/candidates/index.vue',
    'app/pages/dashboard/applications/index.vue',
    'app/pages/dashboard/interviews/index.vue',
    'app/pages/dashboard/timeline.vue',
    'app/pages/dashboard/settings/members.vue',
    'app/components/ApplyCandidateModal.vue',
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
      'app/pages/dashboard/candidates/index.vue',
      'app/pages/dashboard/applications/index.vue',
      'app/pages/dashboard/interviews/index.vue',
      'app/pages/dashboard/timeline.vue',
    ]

    for (const relativePath of dashboardToolbarSearches) {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8')
      expect(source, relativePath).toMatch(/<GooeySearchInput[\s\S]*class="[^"]*min-w-0[^"]*flex-1[^"]*sm:max-w-sm/)
    }
  })
})
