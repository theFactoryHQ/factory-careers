import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('application transition icons', () => {
  it('maps application transition statuses to shared icons', () => {
    const component = readProjectFile('app/components/ApplicationTransitionIcon.vue')
    const css = readProjectFile('app/assets/css/main.css')

    expect(component).toContain('interview: Calendar')
    expect(component).toContain('offer: BriefcaseBusiness')
    expect(component).toContain('rejected: CircleX')
    expect(component).toContain('screening: ScanSearch')
    expect(component).toContain('class="factory-application-transition-icon size-3 shrink-0"')
    expect(css).toContain('.factory-application-transition-icon')
  })

  it('uses icons instead of dots on application transition buttons', () => {
    const drawer = readProjectFile('app/components/ApplicationDetailDrawer.vue')
    const fullPage = readProjectFile('app/pages/dashboard/applications/[id].vue')
    const jobPage = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const candidateSidebar = readProjectFile('app/components/CandidateDetailSidebar.vue')

    for (const source of [drawer, fullPage, jobPage, candidateSidebar]) {
      expect(source).toContain('ApplicationTransitionIcon :status="nextStatus"')
    }
    for (const source of [drawer, fullPage, jobPage]) {
      expect(source).not.toContain('getApplicationTransitionDotClass(nextStatus)')
    }
    expect(drawer).not.toContain('mr-1.5 inline-flex size-1 rounded-full')
    expect(fullPage).not.toContain('mr-1.5 inline-flex size-1 rounded-full')
  })
})
