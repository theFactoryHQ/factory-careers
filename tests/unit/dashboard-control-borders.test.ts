import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'app/assets/css/main.css'), 'utf8')
const candidatePage = readFileSync(join(process.cwd(), 'app/pages/dashboard/candidates/[id].vue'), 'utf8')
const documentsPanel = readFileSync(join(process.cwd(), 'app/components/CandidateDocumentsPanel.vue'), 'utf8')

function cssBlock(selector: string) {
  const start = css.indexOf(selector)
  expect(start, `missing selector: ${selector}`).toBeGreaterThan(-1)
  const bodyStart = css.indexOf('{', start)
  let depth = 0

  for (let index = bodyStart; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') depth -= 1
    if (depth === 0) return css.slice(bodyStart, index + 1)
  }

  throw new Error(`unterminated selector: ${selector}`)
}

describe('dashboard control borders', () => {
  it('keeps routine actions open and borderless', () => {
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-button-secondary {')).toContain('border-color: transparent !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-toolbar-button {')).toContain('border-color: transparent !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-toolbar-button:hover {')).toContain('background-color: var(--ui-control-fill-hover) !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-job-more-button {')).toContain('border-color: transparent !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-dashboard-quick-action {')).toContain('border: 0 !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-dashboard-quick-action:hover {')).toContain('background-color: var(--ui-control-fill-hover) !important;')
  })

  it('uses tint and a bottom accent for tabs and segmented controls', () => {
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-tab {')).toContain('border: 0 !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-tab-active {')).toContain('box-shadow: inset 0 -2px 0 var(--color-brand-500) !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-job-subnav-tab {')).toContain('border: 0 !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-job-subnav-tab-active {')).toContain('box-shadow: inset 0 -2px 0 var(--color-brand-500) !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-candidate-detail-tab {')).toContain('border: 0;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-candidate-detail-tab-active {')).toContain('box-shadow: inset 0 -2px 0 var(--color-brand-500);')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-view-toggle {')).toContain('border-color: transparent !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-view-toggle button {')).toContain('border: 0 !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-view-toggle button.is-active {')).toContain('box-shadow: inset 0 -2px 0 var(--color-brand-500) !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-job-stage-mini {')).toContain('border: 0 !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-job-stage-mini.is-active {')).toContain('box-shadow: inset 0 -2px 0 var(--color-brand-500) !important;')
  })

  it('preserves focus and high-signal boundaries', () => {
    expect(css).not.toContain(':where(.factory-dashboard-shell, .factory-dashboard-portal) :is(\n    .ui-button,')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) :is(button:not(.gooey-search-trigger):not(.gooey-search-clear), a):focus-visible {')).toContain('outline: 2px solid color-mix(in srgb, var(--color-brand-500) 62%, transparent) !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-button-primary {')).toContain('border-color: var(--color-brand-500) !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-button-danger-outline {')).toContain('border-color: var(--factory-tone-danger-outline-border) !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-field {')).toContain('border-color: var(--ui-border-strong) !important;')
    expect(cssBlock('.factory-back-button:hover {')).toContain('background-color: #ffffff !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-back-button:hover {')).toContain('background-color: var(--ui-control-fill-hover) !important;')
  })

  it('keeps destructive toolbar actions visibly bounded', () => {
    expect(candidatePage).toContain('factory-toolbar-button factory-toolbar-button-danger')
    expect(documentsPanel).toContain('factory-toolbar-button factory-toolbar-button-danger')

    const dangerToolbar = cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-toolbar-button-danger {')
    expect(dangerToolbar).toContain('border-color: var(--factory-tone-danger-action-border) !important;')
    expect(dangerToolbar).toContain('color: var(--factory-tone-danger-text) !important;')

    const dangerToolbarHover = cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-toolbar-button-danger:hover {')
    expect(dangerToolbarHover).toContain('border-color: var(--factory-tone-danger-action-hover-bg) !important;')
  })
})
