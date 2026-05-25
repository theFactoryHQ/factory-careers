import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function expectFile(path: string) {
  expect(existsSync(join(process.cwd(), path)), `${path} should exist`).toBe(true)
  return readProjectFile(path)
}

describe('shared keyboard and popover primitives', () => {
  it('provides reusable focus, outside-click, menu, and listbox helpers', () => {
    const outsidePointer = expectFile('app/composables/useOutsidePointer.ts')
    const focusTrap = expectFile('app/composables/useFocusTrap.ts')
    const menuButton = expectFile('app/composables/useMenuButton.ts')
    const listboxNavigation = expectFile('app/composables/useListboxNavigation.ts')

    expect(outsidePointer).toContain('useOutsidePointer')
    expect(focusTrap).toContain('useFocusTrap')
    expect(focusTrap).toContain('restoreFocus')
    expect(focusTrap).toContain('focusFirst')
    expect(menuButton).toContain('useMenuButton')
    expect(menuButton).toContain('aria-expanded')
    expect(menuButton).toContain('focusTrigger')
    expect(listboxNavigation).toContain('useListboxNavigation')
    expect(listboxNavigation).toContain('activeDescendantId')
    expect(listboxNavigation).toContain('selectActive')
  })

  it('uses the shared primitives in representative dashboard controls', () => {
    const filterDrawer = readProjectFile('app/components/FilterDrawer.vue')
    const factorySelect = readProjectFile('app/components/FactorySelect.vue')
    const topbar = readProjectFile('app/components/AppTopBar.vue')

    expect(filterDrawer).toContain('useFocusTrap')
    expect(filterDrawer).not.toContain("document.addEventListener('keydown', onKeydown)")

    expect(factorySelect).toContain('useOutsidePointer')
    expect(factorySelect).toContain('useListboxNavigation')
    expect(factorySelect).toContain('aria-activedescendant')
    expect(factorySelect).not.toContain('document.addEventListener(\'click\', handleClickOutside')

    expect(topbar).toContain('useMenuButton')
    expect(topbar).toContain('moreActionsMenu')
    expect(topbar).not.toContain('const showFactoryMoreActions = false')
    expect(topbar).not.toMatch(/v-if="showFactoryMoreActions"[\s\S]*title="More options"/)
  })
})
