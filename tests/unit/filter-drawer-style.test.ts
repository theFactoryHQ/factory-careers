import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('filter drawer styling', () => {
  it('gives shared filter drawers an opaque Factory panel surface', () => {
    const css = readProjectFile('app/assets/css/main.css')
    const drawerRule = css.match(/\.ui-filter-drawer,[^{]+\{[^}]+\}/)?.[0] ?? ''
    const bodyRule = css.match(/\.ui-filter-drawer-body,[^{]+\{[^}]+\}/)?.[0] ?? ''

    expect(css).toContain('.factory-dashboard-portal.ui-filter-drawer')
    expect(drawerRule).toContain('background-color: #000000 !important')
    expect(bodyRule).toContain('#000000 !important')
  })
})
