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
    const transitionChip = page.match(/factory-application-transition-chip[\s\S]*?<\/button>/)?.[0] ?? ''

    expect(page).toContain('factory-application-transition-strip mx-auto flex max-w-4xl flex-nowrap')
    expect(page).toContain('factory-application-transition-chip')
    expect(transitionChip).toContain('ApplicationTransitionIcon :status="nextStatus"')
    expect(transitionChip).toContain('factory-application-transition-label')
    expect(transitionChip).toContain(':title="`${getApplicationTransitionLabel(nextStatus)} ${idx + 1}`"')
    expect(transitionChip).not.toContain('getApplicationTransitionDotClass(nextStatus)')
    expect(transitionChip).not.toContain('pipeline-status-dot')
    expect(page).toContain('factory-application-transition-shortcut')
    expect(page).not.toContain('getApplicationTransitionButtonClass(nextStatus)')
    expect(page).not.toContain('rounded-lg px-3 py-1.5 text-xs font-semibold')
    expect(chipRule).toContain('height: 32px !important')
    expect(chipRule).toContain('border-radius: 0 !important')
    expect(chipRule).toContain('background-color: #050505 !important')
    expect(chipRule).toContain('font-weight: 300 !important')
    expect(shortcutRule).toContain('border-left: 1px solid rgb(255 255 255 / 0.12)')
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*\.factory-application-transition-label[\s\S]*clip:\s*rect\(0, 0, 0, 0\)/)
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*\.factory-application-transition-chip\s*\{[\s\S]*width:\s*60px/)
  })
})
