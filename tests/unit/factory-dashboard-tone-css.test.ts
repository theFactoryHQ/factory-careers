import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

const cssBlock = (source: string, selector: string) => {
  const start = source.indexOf(selector)
  expect(start, `missing selector: ${selector}`).toBeGreaterThan(-1)

  const bodyStart = source.indexOf('{', start)
  const bodyEnd = source.indexOf('\n  }', bodyStart)
  expect(bodyStart, `missing block start for: ${selector}`).toBeGreaterThan(start)
  expect(bodyEnd, `missing block end for: ${selector}`).toBeGreaterThan(bodyStart)

  return source.slice(bodyStart, bodyEnd)
}

describe('Factory dashboard tone consolidation', () => {
  it('defines dashboard semantic tone tokens in one scoped layer', () => {
    const css = readProjectFile('app/assets/css/main.css')
    const scope = cssBlock(css, ':where(.factory-dashboard-shell, .factory-dashboard-portal) {')

    for (const token of [
      '--factory-tone-danger-border',
      '--factory-tone-danger-bg',
      '--factory-tone-danger-text',
      '--factory-tone-danger-outline-border',
      '--factory-tone-success-border',
      '--factory-tone-success-pill-border',
      '--factory-tone-success-bg',
      '--factory-tone-success-text',
      '--factory-tone-success-dot',
      '--factory-tone-warning-border',
      '--factory-tone-warning-bg',
      '--factory-tone-warning-text',
      '--factory-tone-warning-dot',
      '--factory-tone-info-border',
      '--factory-tone-info-bg',
      '--factory-tone-info-text',
      '--factory-tone-danger-dot',
    ]) {
      expect(scope).toContain(token)
    }
  })

  it('uses semantic tone tokens for dashboard alerts, buttons, utility backgrounds, text, and borders', () => {
    const css = readProjectFile('app/assets/css/main.css')

    for (const selector of [
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-alert-danger,',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-alert-success',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-alert-warning',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-alert-info',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-button-success',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-button-danger',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-button-danger-outline',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-pill-success',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-feedback-success',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-feedback-warning',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-status-dot-success',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-status-dot-warning',
      ':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-status-dot-danger',
    ]) {
      expect(cssBlock(css, selector), selector).toContain('var(--factory-tone-')
    }

    const utilityStart = css.indexOf(':where(.factory-dashboard-shell, .factory-dashboard-portal) :is(.bg-blue-50')
    const utilityEnd = css.indexOf(':where(.factory-dashboard-shell, .factory-dashboard-portal) :is(\n    .text-surface-900,')

    expect(utilityStart, 'missing dashboard semantic utility start marker').toBeGreaterThan(-1)
    expect(utilityEnd, 'missing dashboard semantic utility end marker').toBeGreaterThan(-1)
    expect(utilityEnd, 'dashboard semantic utility end marker should follow start marker').toBeGreaterThan(utilityStart)

    const semanticUtilityLayer = css.slice(utilityStart, utilityEnd)

    for (const token of [
      '--factory-tone-info-bg',
      '--factory-tone-info-text',
      '--factory-tone-warning-bg',
      '--factory-tone-warning-text',
      '--factory-tone-success-bg',
      '--factory-tone-success-text',
      '--factory-tone-danger-bg',
      '--factory-tone-danger-text',
      '--factory-tone-border',
    ]) {
      expect(semanticUtilityLayer).toContain(`var(${token}`)
    }
  })
})
