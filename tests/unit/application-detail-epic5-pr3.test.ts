import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('application detail epic 5 pr3', () => {
  it('unifies CandidateDetailSidebar on useApplication for fetch and mutations', () => {
    const sidebar = readProjectFile('app/components/CandidateDetailSidebar.vue')

    expect(sidebar).toContain('useApplication(() => props.applicationId)')
    expect(sidebar).toContain('updateApplication')
    expect(sidebar).toMatch(/updateStatus:\s*status\s*=>\s*updateApplication\(\{\s*status:\s*status\s+as\s+ApplicationStatus\s*\}\)/)
    expect(sidebar).toContain('save: notes => updateApplication({ notes })')
    expect(sidebar).toContain("track('sidebar_status_changed'")
    expect(sidebar).toContain("emit('updated')")

    expect(sidebar).not.toContain('updateApplicationStatus')
    expect(sidebar).not.toContain('updateApplicationNotes')
    expect(sidebar).not.toContain('sidebar-application-')
    expect(sidebar).not.toMatch(/useFetch\(\s*\n?\s*\(\) => `\/api\/applications\/\$\{props\.applicationId\}`/)
  })

  it('keeps shared application detail panels on the sidebar surface', () => {
    const sidebar = readProjectFile('app/components/CandidateDetailSidebar.vue')

    for (const panel of [
      'ApplicationNotesPanel',
      'ApplicationInterviewsPanel',
      'ApplicationDocumentsPanel',
      'ApplicationResponsesPanel',
      'ApplicationTimelinePanel',
    ]) {
      expect(sidebar, `sidebar should use ${panel}`).toContain(`<${panel}`)
    }

    expect(sidebar).toContain('surface="sidebar"')
    expect(sidebar).toContain('useApplicationDocumentActions')
    expect(sidebar).toContain('useApplicationTimeline')
    expect(sidebar).toContain('useApplicationStatusActions')
    expect(sidebar).toContain('useEditableApplicationNotes')
  })
})