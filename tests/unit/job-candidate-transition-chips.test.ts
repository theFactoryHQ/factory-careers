import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('job candidate transition chips', () => {
  it('uses Factory chip styling instead of solid colored action pills', () => {
    const page = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const css = readProjectFile('app/assets/css/main.css')
    const chipRule = css.match(/\.factory-application-transition-chip\s*\{[^}]+\}/)?.[0] ?? ''
    const shortcutRule = css.match(/\.factory-application-transition-shortcut\s*\{[^}]+\}/)?.[0] ?? ''

    expect(page).toContain('factory-application-transition-chip')
    expect(page).toContain('pipeline-status-dot size-2 rounded-full')
    expect(page).toContain('getApplicationTransitionDotClass(nextStatus)')
    expect(page).toContain('factory-application-transition-shortcut')
    expect(page).not.toContain('getApplicationTransitionButtonClass(nextStatus)')
    expect(page).not.toContain('rounded-lg px-3 py-1.5 text-xs font-semibold')
    expect(chipRule).toContain('height: 32px !important')
    expect(chipRule).toContain('border-radius: 0 !important')
    expect(chipRule).toContain('background-color: #050505 !important')
    expect(chipRule).toContain('font-weight: 300 !important')
    expect(shortcutRule).toContain('border-left: 1px solid rgb(255 255 255 / 0.12)')
  })
})
