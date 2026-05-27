import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function expectFile(path: string) {
  expect(existsSync(join(process.cwd(), path)), `${path} should exist`).toBe(true)
  return readProjectFile(path)
}

function listVueFiles(dir: string): string[] {
  const absoluteDir = join(process.cwd(), dir)
  return readdirSync(absoluteDir).flatMap((entry) => {
    const path = join(dir, entry)
    const absolutePath = join(process.cwd(), path)
    if (statSync(absolutePath).isDirectory()) return listVueFiles(path)
    return path.endsWith('.vue') ? [path] : []
  })
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

  it('keeps Factory dropdown menus on the floating portal path', () => {
    const files = listVueFiles('app')
      .filter(file => readProjectFile(file).includes('factory-filter-dropdown-menu'))

    const localAbsoluteMenus = files.flatMap((file) => {
      const source = readProjectFile(file)
      return [...source.matchAll(/class="[^"]*factory-filter-dropdown-menu[^"]*absolute[^"]*"/g)]
        .map(match => `${file}: ${match[0]}`)
    })

    expect(localAbsoluteMenus).toEqual([])
  })

  it('keeps bespoke dropdown and menu panels on an explicit floating path', () => {
    const panelPattern = /role="menu"|role="listbox"|Dropdown|dropdown|openMenuId|show.*Menu|show.*Dropdown|panelOpen/
    const files = listVueFiles('app')
      .filter(file => panelPattern.test(readProjectFile(file)))

    const ignoredSnippets = [
      'tooltip',
      'pointer-events-none',
      'ui-modal',
      'factory-job-more-menu',
    ]
    const floatingPatterns = [
      '<Teleport',
      'factory-dashboard-portal',
      'factory-public-form-portal',
      'data-member-role-menu',
    ]

    const localAbsolutePanels = files.flatMap((file) => {
      const source = readProjectFile(file)
      return [...source.matchAll(/class="[^"]*(?:absolute|bottom-full|top-full|top-\[calc\(100%)[^"]*"/g)]
        .filter((match) => {
          const snippet = match[0]
          if (!/(menu|dropdown|panel|popover)/i.test(snippet)) return false
          if (ignoredSnippets.some(pattern => snippet.includes(pattern))) return false
          const context = source.slice(Math.max(0, match.index - 450), Math.min(source.length, match.index + 450))
          return !floatingPatterns.some(pattern => context.includes(pattern) || snippet.includes(pattern))
        })
        .map(match => `${file}: ${match[0]}`)
    })

    expect(localAbsolutePanels).toEqual([])
  })
})
