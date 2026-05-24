import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

function cssRule(source: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  return match?.[1] ?? ''
}

describe('application form requirement cards', () => {
  it('uses readable Factory text colors inside selectable requirement panels', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const css = readProjectFile('app/assets/css/main.css')

    expect(source).toContain('factory-requirement-option-title')
    expect(source).toContain('factory-requirement-option-description')
    expect(cssRule(css, ':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-requirement-option-title')).toContain('color: #ffffff !important')
    expect(cssRule(css, ':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-requirement-option-description')).toContain('color: rgb(255 255 255 / 0.72) !important')
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

  it('lets admins preview the applicant-facing form in a modal', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')

    expect(source).toContain('showApplicationPreview')
    expect(source).toContain('Preview form')
    expect(source).toContain('Application Preview')
    expect(source).toContain('Applicant view')
    expect(source).toContain('Name <span')
    expect(source).toContain('Email <span')
    expect(source).toContain('Phone')
    expect(source).toContain('Country <span')
    expect(source).toContain('State <span')
    expect(source).toContain('Resume / CV')
    expect(source).toContain('Cover Letter')
    expect(source).toContain('v-for="q in previewQuestions"')
  })
})
