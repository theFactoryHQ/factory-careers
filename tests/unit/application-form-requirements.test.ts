import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('application form requirement cards', () => {
  it('uses readable Factory text colors inside selectable requirement panels', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const css = readProjectFile('app/assets/css/main.css')

    expect(source).toContain('factory-requirement-option-title')
    expect(source).toContain('factory-requirement-option-description')
    expect(css).toMatch(/\.factory-requirement-option-title\s*\{[\s\S]*color:\s*var\(--color-surface-950\) !important/)
    expect(css).toMatch(/\.factory-requirement-option-description\s*\{[\s\S]*color:\s*var\(--color-surface-700\) !important/)
  })

  it('renders the application link with the global click-anywhere copy field', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const linkSection = source.slice(source.indexOf('Application Link'), source.indexOf('Application Requirements'))

    expect(linkSection).toContain('<CopyField')
    expect(linkSection).toContain(':value="applicationUrl"')
    expect(linkSection).toContain('label="application link"')
    expect(linkSection).toContain('tone="brand"')
    expect(linkSection).not.toContain('readonly')
    expect(linkSection).not.toContain('class="ui-field')
  })
})
