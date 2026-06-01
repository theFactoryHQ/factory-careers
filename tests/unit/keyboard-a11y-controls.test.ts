import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('remaining keyboard and accessibility controls', () => {
  it('keeps property filter popovers keyboard dismissible with focus restore', () => {
    const source = readProjectFile('app/components/PropertyFilterBar.vue')

    expect(source).toContain('pickerTriggerRef')
    expect(source).toContain('editTriggerRefs')
    expect(source).toContain('focusFirstPickerOption')
    expect(source).toContain('closePicker({ restoreFocus: true })')
    expect(source).toContain('closeEdit({ restoreFocus: true })')
    expect(source).toContain('@keydown.escape.prevent')
  })

  it('makes teleported property value popovers act like keyboard listboxes', () => {
    const source = readProjectFile('app/components/PropertyValueEditor.vue')

    expect(source).toContain('propertyOptionNavigation')
    expect(source).toContain('aria-activedescendant')
    expect(source).toContain('role="listbox"')
    expect(source).toContain('role="option"')
    expect(source).toContain('focusTrigger')
    expect(source).toContain('@keydown="propertyOptionNavigation.onKeydown"')
  })

  it('keeps property schema editor focus-managed and not drag-only', () => {
    const source = readProjectFile('app/components/PropertySchemaEditor.vue')

    expect(source).toContain('useFocusTrap')
    expect(source).toContain('moveDefinition(def.id, -1)')
    expect(source).toContain('moveDefinition(def.id, 1)')
    expect(source).toContain('aria-label="Move property up"')
    expect(source).toContain('aria-label="Move property down"')
  })

  it('uses FactorySelect for the interview timezone picker', () => {
    const source = readProjectFile('app/components/InterviewScheduleSidebar.vue')

    expect(source).toContain('timezoneOptions')
    expect(source).toContain('<FactorySelect')
    expect(source).not.toContain('showTimezoneDropdown')
  })

  it('adds axe-backed keyboard Playwright coverage', () => {
    const fixtures = readProjectFile('e2e/fixtures.ts')
    const regression = readProjectFile('e2e/accessibility/keyboard-regression.spec.ts')
    const dashboard = readProjectFile('e2e/accessibility/dashboard-controls.spec.ts')

    expect(fixtures).toContain("from '@axe-core/playwright'")
    expect(fixtures).toContain('runAxeScan')
    expect(fixtures).toContain('expectFocusRestored')
    expect(regression).toContain('runAxeScan')
    expect(regression).toContain('expectVisibleFocus')
    expect(dashboard).toContain('Columns')
    expect(dashboard).toContain('timezone')
  })
})
