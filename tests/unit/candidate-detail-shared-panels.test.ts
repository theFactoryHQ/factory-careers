import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('candidate detail shared panels', () => {
  it('renders shared candidate detail panels from drawer and full-page shells', () => {
    const drawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const page = readProjectFile('app/pages/dashboard/candidates/[id].vue')

    for (const source of [drawer, page]) {
      expect(source).toContain('<CandidateDetailsCard')
      expect(source).toContain('<CandidateApplicationsPanel')
      expect(source).toContain('<CandidateDocumentsPanel')
      expect(source).toContain('useDocumentPreview')
    }

    for (const path of [
      'app/components/CandidateDetailDrawer.vue',
      'app/pages/dashboard/candidates/[id].vue',
    ]) {
      const source = readProjectFile(path)
      expect(source, `${path} should not define local document type labels`).not.toContain('const documentTypeLabels')
      expect(source, `${path} should not hand-roll preview refs`).not.toContain('const previewUrl = ref')
      expect(source, `${path} should not render application status badges inline`).not.toContain('<ApplicationStatusBadge :status="app.status" />')
    }
  })

  it('keeps document labels and application badges in shared candidate panels', () => {
    const documentsPanel = readProjectFile('app/components/CandidateDocumentsPanel.vue')
    const applicationsPanel = readProjectFile('app/components/CandidateApplicationsPanel.vue')
    const detailsCard = readProjectFile('app/components/CandidateDetailsCard.vue')
    const panelClass = readProjectFile('app/composables/useCandidatePanelClass.ts')

    expect(documentsPanel).toContain('documentTypeLabels')
    expect(documentsPanel).toContain('Back to documents')
    expect(applicationsPanel).toContain('<ApplicationStatusBadge :status="app.status" />')
    expect(applicationsPanel).toContain('ApplicationTimestampStack')
    expect(detailsCard).toContain('<PropertyBlock')

    for (const source of [documentsPanel, applicationsPanel, detailsCard]) {
      expect(source).toContain('useCandidatePanelClass(() => props.surface)')
      expect(source).not.toContain("props.surface === 'drawer'\n    ? 'border border-white/12 bg-white/[0.025]'\n    : 'ui-panel ui-dashboard-panel'")
    }

    expect(panelClass).toContain("export const CANDIDATE_PANEL_PAGE_CLASS = 'ui-panel ui-dashboard-panel'")
    expect(panelClass).toContain("export const CANDIDATE_PANEL_DRAWER_CLASS = 'border border-white/12 bg-white/[0.025]'")
    expect(panelClass).toContain('export function getCandidatePanelClass')
  })

  it('keeps drawer headings and document row previews accessible', () => {
    const detailsCard = readProjectFile('app/components/CandidateDetailsCard.vue')
    const documentsPanel = readProjectFile('app/components/CandidateDocumentsPanel.vue')

    expect(detailsCard).toContain("props.surface === 'drawer' ? 'h2' : 'h1'")
    expect(detailsCard).toContain('<component')
    expect(detailsCard).toContain(':is="headingTag"')

    expect(documentsPanel).toContain(':role="isPdfDocument(doc) ? \'button\' : undefined"')
    expect(documentsPanel).toContain(':tabindex="isPdfDocument(doc) ? 0 : undefined"')
    expect(documentsPanel).toContain('@keydown.enter.prevent="previewDocument(doc)"')
    expect(documentsPanel).toContain('@keydown.space.prevent="previewDocument(doc)"')
  })

  it('downloads non-pdf documents when preview callers omit the mime type', () => {
    const composable = readProjectFile('app/composables/useDocumentPreview.ts')

    expect(composable).toContain('const doc = options.documents()?.find((item) => item.id === docId)')
    expect(composable).toContain('const resolvedMimeType = mimeType ?? doc?.mimeType')
    expect(composable).toContain("if (resolvedMimeType !== 'application/pdf')")
  })
})
