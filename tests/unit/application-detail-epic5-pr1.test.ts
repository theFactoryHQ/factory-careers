import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function projectPath(path: string) {
  return fileURLToPath(new URL(`../../${path}`, import.meta.url))
}

function readProjectFile(path: string) {
  return readFileSync(projectPath(path), 'utf-8')
}

const applicationDetailSurfaces = [
  'app/components/ApplicationDetailDrawer.vue',
  'app/pages/dashboard/applications/[id].vue',
  'app/components/CandidateDetailSidebar.vue',
]

const sharedPanels = [
  'ApplicationNotesPanel',
  'ApplicationScoringPanel',
  'ApplicationInterviewsPanel',
  'ApplicationDocumentsPanel',
  'ApplicationResponsesPanel',
  'ApplicationTimelinePanel',
]

describe('application detail epic 5 pr1', () => {
  it('grounds shared sub-panels and composables in repo files', () => {
    for (const path of [
      'app/composables/useApplicationPanelClass.ts',
      'app/composables/useApplicationScoringData.ts',
      'app/composables/useApplicationScoringPanel.ts',
      'app/composables/useApplicationDocumentActions.ts',
      'app/composables/useApplicationTimeline.ts',
      'app/utils/interview-display.ts',
      'app/utils/document-display.ts',
      'app/components/ApplicationNotesPanel.vue',
      'app/components/ApplicationScoringPanel.vue',
      'app/components/ApplicationInterviewsPanel.vue',
      'app/components/ApplicationDocumentsPanel.vue',
      'app/components/ApplicationResponsesPanel.vue',
      'app/components/ApplicationTimelinePanel.vue',
    ]) {
      expect(existsSync(projectPath(path)), path).toBe(true)
    }

    const panelClass = readProjectFile('app/composables/useApplicationPanelClass.ts')
    expect(panelClass).toContain("export type ApplicationPanelSurface = 'sidebar' | 'drawer' | 'page'")
    expect(panelClass).toContain('export function getApplicationPanelClass')
    expect(panelClass).toContain("export const APPLICATION_PANEL_SIDEBAR_CLASS = 'ui-panel'")
    expect(panelClass).toContain("export const APPLICATION_PANEL_DRAWER_CLASS = 'border border-white/12 bg-white/[0.025]'")
    expect(panelClass).toContain("export const APPLICATION_PANEL_PAGE_CLASS = 'ui-panel ui-dashboard-panel'")
  })

  it('uses shared sub-panels on application detail surfaces without hand-rolled panel markup', () => {
    const expectations: Record<string, { uses: string[], avoids: string[] }> = {
      'app/components/ApplicationDetailDrawer.vue': {
        uses: ['<ApplicationNotesPanel', '<ApplicationScoringPanel', '<ApplicationResponsesPanel', 'useApplicationDetailSurface'],
        avoids: ['const scoringSummary = computed', 'const documentTypeLabels', 'const interviewTypeLabels', 'useApplicationScoringPanel', 'useEditableApplicationNotes'],
      },
      'app/pages/dashboard/applications/[id].vue': {
        uses: ['<ApplicationNotesPanel', '<ApplicationScoringPanel', '<ApplicationResponsesPanel', 'useApplicationDetailSurface'],
        avoids: ['const scoringSummary = computed', 'type ApplicationScoresResponse', 'function scoreCurrentApplication', 'useApplicationScoringPanel', 'useEditableApplicationNotes'],
      },
      'app/components/CandidateDetailSidebar.vue': {
        uses: [
          '<ApplicationNotesPanel',
          '<ApplicationInterviewsPanel',
          '<ApplicationDocumentsPanel',
          '<ApplicationResponsesPanel',
          '<ApplicationTimelinePanel',
          'useApplicationDocumentActions',
          'useApplicationTimeline',
        ],
        avoids: [
          'const documentTypeLabels',
          'const interviewTypeLabels',
          'function formatInterviewDate',
          'const previewUrl = ref',
          'function describeTimelineItem',
        ],
      },
    }

    for (const [path, { uses, avoids }] of Object.entries(expectations)) {
      const source = readProjectFile(path)
      for (const snippet of uses) {
        expect(source, `${path} should use ${snippet}`).toContain(snippet)
      }
      for (const snippet of avoids) {
        expect(source, `${path} should not define ${snippet}`).not.toContain(snippet)
      }
    }
  })

  it('keeps document and interview labels in shared helpers and panels', () => {
    const documentsPanel = readProjectFile('app/components/ApplicationDocumentsPanel.vue')
    const interviewsPanel = readProjectFile('app/components/ApplicationInterviewsPanel.vue')
    const interviewDisplay = readProjectFile('app/utils/interview-display.ts')
    const documentDisplay = readProjectFile('app/utils/document-display.ts')

    expect(documentDisplay).toContain('DOCUMENT_TYPE_LABELS')
    expect(documentsPanel).toContain('DOCUMENT_TYPE_LABELS')
    expect(interviewDisplay).toContain('INTERVIEW_TYPE_LABELS')
    expect(interviewsPanel).toContain('INTERVIEW_TYPE_LABELS')
    expect(interviewsPanel).toContain('formatInterviewDate')
  })

  it('prefers shared sub-panels over a single variant prop on the shell', () => {
    const notesPanel = readProjectFile('app/components/ApplicationNotesPanel.vue')
    const scoringPanel = readProjectFile('app/components/ApplicationScoringPanel.vue')

    for (const source of [notesPanel, scoringPanel]) {
      expect(source).toContain('useApplicationPanelClass(() => props.surface)')
      expect(source).not.toContain('variant=')
    }

    for (const path of applicationDetailSurfaces) {
      const source = readProjectFile(path)
      expect(source, `${path} should pass explicit surface props`).toMatch(/surface="(?:sidebar|drawer|page)"/)
    }
  })

  it('shares document action wiring with the candidate detail page', () => {
    const candidatePage = readProjectFile('app/pages/dashboard/candidates/[id].vue')
    const documentActions = readProjectFile('app/composables/useApplicationDocumentActions.ts')

    expect(candidatePage).toContain('useApplicationDocumentActions')
    expect(candidatePage).not.toContain('const previewUrl = ref')
    expect(documentActions).toContain('useDocumentPreview')
    expect(documentActions).toContain('handleReparse')
  })

  it('keeps panel ownership split for PR2/PR3 follow-up', () => {
    for (const panel of sharedPanels) {
      expect(readProjectFile(`app/components/${panel}.vue`)).toContain('surface')
    }

    const sidebar = readProjectFile('app/components/CandidateDetailSidebar.vue')
    const drawer = readProjectFile('app/components/ApplicationDetailDrawer.vue')

    expect(sidebar).toContain('Candidate detail')
    expect(drawer).toContain('<AppDetailDrawerShell')
    expect(sidebar).not.toContain('<AppDetailDrawerShell')
    expect(drawer).not.toContain('activeTab')
  })
})