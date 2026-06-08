import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('panel close buttons', () => {
  it('uses a no-fill ghost recipe for filter and side panel close buttons', () => {
    const css = readProjectFile('app/assets/css/main.css')
    const closeRule = css.match(/\.ui-panel-close-button\s*\{[^}]+\}/)?.[0] ?? ''
    const closeHoverRule = css.match(/\.ui-panel-close-button:hover:not\(:disabled\)\s*\{[^}]+\}/)?.[0] ?? ''
    const factoryHoverRule = css.match(/\.factory-dashboard-portal \.ui-panel-close-button:hover:not\(:disabled\)\s*\{[^}]+\}/)?.[0] ?? ''

    expect(closeRule).toContain('background-color: transparent !important')
    expect(closeHoverRule).toContain('background-color: transparent !important')
    expect(factoryHoverRule).toContain('background-color: transparent !important')
  })

  it('applies the close recipe to common filter and right side panel X controls', () => {
    for (const path of [
      'app/components/FilterDrawer.vue',
      'app/components/AppDetailDrawerShell.vue',
      'app/components/CandidateDetailSidebar.vue',
      'app/components/InterviewScheduleSidebar.vue',
      'app/components/PropertySchemaEditor.vue',
      'app/components/ChatbotSourcesPanel.vue',
      'app/components/ApplicationLinkModal.vue',
    ]) {
      expect(readProjectFile(path), `${path} should use panel close styling`).toContain('ui-panel-close-button')
    }

    for (const path of [
      'app/components/FilterDrawer.vue',
      'app/components/AppDetailDrawerShell.vue',
      'app/components/ApplicationLinkModal.vue',
    ]) {
      const source = readProjectFile(path)
      const closeButtons = [...source.matchAll(/<button\b[^>]*\bui-panel-close-button\b[^>]*>/g)]
      expect(closeButtons.length, `${path} should declare a ui-panel-close-button`).toBeGreaterThan(0)
      for (const [match] of closeButtons) {
        expect(match, `${path} panel close button should be an explicit button type`).toContain('type="button"')
      }
    }
  })
})
