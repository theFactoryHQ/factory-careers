import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function projectPath(path: string) {
  return fileURLToPath(new URL(`../../${path}`, import.meta.url))
}

function readProjectFile(path: string) {
  return readFileSync(projectPath(path), 'utf-8')
}

const sharedDetailSurfaces = [
  'app/components/ApplicationDetailDrawer.vue',
  'app/pages/dashboard/applications/[id].vue',
]

describe('application detail epic 5 pr2', () => {
  it('exports the shared application detail surface composable', () => {
    const path = 'app/composables/useApplicationDetailSurface.ts'
    expect(existsSync(projectPath(path)), path).toBe(true)

    const source = readProjectFile(path)
    expect(source).toContain('export function useApplicationDetailSurface')
    expect(source).toContain('useApplicationScoringPanel')
    expect(source).toContain('useEditableApplicationNotes')
    expect(source).toContain('useApplicationStatusActions')
    expect(source).toContain('showInterviewSidebar')
    expect(source).toContain('openInterviewScheduler')
    expect(source).toContain('focusOnEdit: true')
    expect(source).toContain('source: options.source')
    expect(source).toContain('updateApplication({ notes })')
    expect(source).toContain('updateApplication({ status: status as ApplicationStatus })')
  })

  it('uses the shared surface composable on drawer and full page', () => {
    for (const path of sharedDetailSurfaces) {
      const source = readProjectFile(path)

      expect(source, `${path} should use the shared surface composable`).toContain('useApplicationDetailSurface')
      expect(source, `${path} should not wire scoring panel directly`).not.toContain('useApplicationScoringPanel')
      expect(source, `${path} should not wire editable notes directly`).not.toContain('useEditableApplicationNotes')
    }
  })

  it('keeps surface-specific scoring sources and refresh behavior', () => {
    const drawer = readProjectFile('app/components/ApplicationDetailDrawer.vue')
    const page = readProjectFile('app/pages/dashboard/applications/[id].vue')

    expect(drawer).toContain("source: 'application_detail_drawer'")
    expect(drawer).toContain('refreshApplication: false')
    expect(page).toContain("source: 'application_detail_page'")
    expect(page).toContain('refresh,')
    expect(page).not.toContain('refreshApplication: false')
  })
})