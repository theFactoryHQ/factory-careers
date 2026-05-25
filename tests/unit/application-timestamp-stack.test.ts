import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('application timestamp stack', () => {
  it('centralizes applied and updated timestamp styling', () => {
    const component = readProjectFile('app/components/ApplicationTimestampStack.vue')
    const css = readProjectFile('app/assets/css/main.css')
    const linkRule = css.match(/\.factory-application-timestamp-link\s*\{[^}]+\}/)?.[0] ?? ''
    const offsetRule = css.match(/\.factory-application-timestamp-link-offset\s*\{[^}]+\}/)?.[0] ?? ''
    const valueRule = css.match(/\.factory-application-timestamp-value\s*\{[^}]+\}/)?.[0] ?? ''

    expect(component).toContain('factory-application-timestamps')
    expect(component).toContain('sm:absolute sm:right-5 sm:top-5')
    expect(component).toContain('factory-application-timestamp-label')
    expect(component).toContain('factory-application-timestamp-value')
    expect(component).toContain('factory-application-timestamp-link-offset')
    expect(component).toContain('showUpdated')
    expect(linkRule).toContain('font-size: 12px')
    expect(linkRule).toContain('font-weight: 500')
    expect(offsetRule).toContain('padding-left: 20px')
    expect(valueRule).toContain('font-variant-numeric: tabular-nums')
  })

  it('uses the shared timestamp stack across application detail surfaces', () => {
    const drawer = readProjectFile('app/components/ApplicationDetailDrawer.vue')
    const fullPage = readProjectFile('app/pages/dashboard/applications/[id].vue')
    const jobPage = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const candidateSidebar = readProjectFile('app/components/CandidateDetailSidebar.vue')
    const candidateDrawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const candidatePage = readProjectFile('app/pages/dashboard/candidates/[id].vue')
    const candidateApplicationsPanel = readProjectFile('app/components/CandidateApplicationsPanel.vue')

    for (const source of [drawer, fullPage, jobPage, candidateSidebar, candidateApplicationsPanel]) {
      expect(source).toContain('ApplicationTimestampStack')
    }
    expect(candidateDrawer).toContain('<CandidateApplicationsPanel')
    expect(candidatePage).toContain('<CandidateApplicationsPanel')
    expect(drawer).not.toContain('uppercase text-white/36">Applied')
    expect(fullPage).not.toContain('uppercase text-white/36">Applied')
    expect(jobPage).not.toContain('Applied {{ new Date(currentSummary.createdAt).toLocaleDateString() }}')
  })
})
