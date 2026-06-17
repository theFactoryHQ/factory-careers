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
  it('owns the applicant-facing job posting configuration', () => {
    const applicationPage = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const settingsPage = readProjectFile('app/pages/dashboard/jobs/[id]/settings.vue')

    expect(applicationPage).toContain('Basic Details')
    expect(applicationPage).toContain('Salary & Compensation')
    expect(applicationPage).toContain('Listing Schedule')
    expect(applicationPage).toContain('Application requirements')
    expect(applicationPage).toContain('Application Link')
    expect(settingsPage).not.toContain('Basic Details')
    expect(settingsPage).not.toContain('Salary & Compensation')
    expect(settingsPage).not.toContain('Listing Schedule')
    expect(settingsPage).not.toContain('Application Link')
    expect(settingsPage).not.toContain('Application Options')
  })

  it('uses readable Factory text colors inside selectable requirement panels', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const css = readProjectFile('app/assets/css/main.css')

    expect(source).toContain('factory-requirement-option-title')
    expect(source).toContain('factory-requirement-option-description')
    expect(cssRule(css, ':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-requirement-option-title')).toContain('color: #ffffff !important')
    expect(cssRule(css, ':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-requirement-option-description')).toContain('color: rgb(255 255 255 / 0.72) !important')
  })

  it('renders the application link as a compact copy row', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const linkSection = source.slice(
      source.indexOf('Shareable application link'),
      source.indexOf('The application link will be available'),
    )

    expect(linkSection).toContain('data-testid="application-link-panel"')
    expect(source).toContain('useCopyToClipboard({ useFallback: true })')
    expect(linkSection).toContain('applicationUrlLabel')
    expect(linkSection).toContain('truncate')
    expect(linkSection).toContain('copyApplicationLink')
    expect(linkSection).toContain(':aria-label="applicationLinkCopied ? \'Copied application link\' : \'Copy application link\'"')
    expect(linkSection).not.toContain('<details')
    expect(linkSection).not.toContain('<summary')
    expect(linkSection).not.toContain('<CopyField')
    expect(linkSection).not.toContain('ui-panel-brand p-5 mb-6')
    expect(linkSection).not.toContain('readonly')
    expect(linkSection).not.toContain('class="ui-field')
  })

  it('lets admins preview the applicant-facing form in a modal', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')

    expect(source).toContain('showApplicationPreview')
    expect(source).toContain('Preview')
    expect(source).not.toContain('Preview form')
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

  it('renders loaded job content before showing stale job fetch errors', () => {
    const applicationPage = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const settingsPage = readProjectFile('app/pages/dashboard/jobs/[id]/settings.vue')
    const aiPage = readProjectFile('app/pages/dashboard/jobs/[id]/ai-analysis.vue')

    expect(applicationPage).toContain('useStaleFetchUi')
    expect(applicationPage).toContain('showSkeleton')
    expect(applicationPage.indexOf('<template v-if="job">')).toBeLessThan(applicationPage.indexOf('Failed to load job.'))
    expect(applicationPage).toContain('fetchStatus !== \'pending\' && !job && error')

    expect(settingsPage).toContain('useStaleFetchUi')
    expect(settingsPage).toContain('showSkeleton')
    expect(settingsPage.indexOf('<template v-if="job">')).toBeLessThan(settingsPage.indexOf('Failed to load job.'))
    expect(settingsPage).toContain('fetchStatus !== \'pending\' && !job && fetchError')

    expect(aiPage).toContain('jobFetchStatus === \'pending\' && !job')
    expect(aiPage.indexOf('<template v-if="job && criteriaFetchStatus !== \'pending\'">')).toBeLessThan(aiPage.indexOf('Failed to load job.'))
    expect(aiPage).toContain('jobFetchStatus !== \'pending\' && !job && jobError')
  })

  it('autosaves low-risk application form toggles without separate save buttons', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')

    expect(source).toContain('autosaveRequirements')
    expect(source).toContain('autosaveComplianceQuestions')
    expect(source).toContain('saveRequirementsAgain')
    expect(source).toContain('activeRequirementsSave')
    expect(source).toContain('saveComplianceAgain')
    expect(source).toContain('activeComplianceSave')
    expect(source).toContain('@click="toggleRequirement(\'resume\')"')
    expect(source).toContain('@click="toggleRequirement(\'coverLetter\')"')
    expect(source).toContain('@click="toggleComplianceEnabled"')
    expect(source).toContain('@change="autosaveComplianceQuestions"')
    expect(source).toContain('requirementsSaveStatus')
    expect(source).toContain('complianceSaveStatus')
    expect(source).not.toContain('Save requirements')
    expect(source).not.toContain('Save compliance questions')
  })
})
