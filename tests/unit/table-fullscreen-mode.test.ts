import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('table fullscreen mode', () => {
  it('useDashboardListPage exits fullscreen on Escape', () => {
    const helper = readProjectFile('app/composables/useDashboardListPage.ts')

    expect(helper).toContain("event.key === 'Escape' && isFullscreen.value")
    expect(helper).toContain('window.addEventListener')
    expect(helper).toContain('window.removeEventListener')
  })

  for (const path of [
    'app/pages/dashboard/candidates/index.vue',
    'app/pages/dashboard/applications/index.vue',
  ]) {
    it(`${path} uses an opaque fullscreen surface and shared list page state`, () => {
      const source = readProjectFile(path)

      expect(source).toContain('factory-fullscreen-surface')
      expect(source).toContain('useDashboardListPage')
      expect(source).toContain('isFullscreen')
    })
  }

  it('defines the shared fullscreen surface as opaque black', () => {
    const css = readProjectFile('app/assets/css/main.css')
    const rule = css.match(/\.factory-fullscreen-surface\s*\{[^}]+\}/)?.[0] ?? ''

    expect(rule).toContain('background-color: #000000 !important')
    expect(rule).toContain('color: #ffffff !important')
  })
})
