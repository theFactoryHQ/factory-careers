import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('E2E accessibility helpers', () => {
  it('consolidates keyboard and axe helpers under e2e/accessibility.ts', () => {
    const source = readProjectFile('e2e/accessibility.ts')

    for (const exportName of [
      'expectNoA11yViolations',
      'runAxeScan',
      'expectVisibleFocus',
      'expectVisibleKeyboardFocus',
      'tabUntilFocused',
      'openWithKeyboard',
      'expectFocusRestored',
    ]) {
      expect(source, exportName).toContain(exportName)
    }
  })

  it('re-exports accessibility helpers from fixtures for backward compatibility', () => {
    const fixtures = readProjectFile('e2e/fixtures.ts')

    expect(fixtures).toContain("from './accessibility'")
    expect(fixtures).toContain('runAxeScan')
    expect(fixtures).not.toContain("from '@axe-core/playwright'")
  })

  it('keeps accessibility specs on the shared accessibility API', () => {
    const specs = [
      'e2e/accessibility/dashboard-controls.spec.ts',
      'e2e/accessibility/keyboard-regression.spec.ts',
      'e2e/critical-flows/accessibility-keyboard.spec.ts',
    ]

    for (const spec of specs) {
      const source = readProjectFile(spec)
      expect(source, spec).toContain('../accessibility')
      expect(source, spec).toMatch(/runAxeScan|expectNoA11yViolations/)
    }
  })
})