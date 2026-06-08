import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('candidate detail drawer', () => {
  it('puts compact icon-only application quick actions beside the status badge', () => {
    const source = readProjectFile('app/components/CandidateApplicationsPanel.vue')
    const drawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const badge = readProjectFile('app/components/ApplicationStatusBadge.vue')
    const useApplication = readProjectFile('app/composables/useApplication.ts')

    expect(drawer).toContain('<CandidateApplicationsPanel')
    expect(drawer).toContain('show-status-transitions')
    expect(drawer).toContain('const transitioningApplicationIds = ref<Set<string>>(new Set())')
    expect(drawer).toContain('useApplicationStatusActions')
    expect(drawer).toContain('patchApplication')
    expect(drawer).not.toContain('$fetch(`/api/applications/${appId}`')
    expect(useApplication).toContain('export async function patchApplication')
    expect(source).toContain('APPLICATION_STATUS_TRANSITIONS')
    expect(source).toContain('getApplicationTransitionButtonClass(nextStatus, \'factory\')')
    expect(source).toContain('getApplicationTransitionActionLabel(nextStatus)')
    expect(source).toContain('<ApplicationTransitionIcon :status="nextStatus" class="size-3.5" />')
    expect(source).toContain('class="group/action relative inline-flex size-8')
    expect(source).toContain(':disabled="transitioningApplicationIds.has(app.id)"')
    expect(source).toContain('aria-label="Schedule Interview"')
    expect(source).not.toContain('Schedule\n                    </button>')
    expect(source).toContain('<ApplicationStatusBadge :status="app.status" />')
    expect(badge).toContain('inline-flex h-8 min-h-8 shrink-0 items-center border')
  })

  it('keeps application row schedule actions and status badges the same height when expanded labels are shown', () => {
    const source = readProjectFile('app/components/CandidateApplicationsPanel.vue')
    const badge = readProjectFile('app/components/ApplicationStatusBadge.vue')

    expect(source).toContain('factory-toolbar-button h-8 min-h-8 gap-1 px-2.5 py-0 text-[10px] font-medium')
    expect(source).toContain('<ApplicationStatusBadge :status="app.status" />')
    expect(badge).toContain('inline-flex h-8 min-h-8 shrink-0 items-center border')
  })

  it('keeps the apply-to-job button visibly interactive', () => {
    const source = readProjectFile('app/components/CandidateApplicationsPanel.vue')
    const applyButton = source.match(/<button[\s\S]*?@click="emit\('apply'\)"[\s\S]*?>/)?.[0] ?? ''

    expect(applyButton).toContain('cursor-pointer')
    expect(applyButton).toContain('hover:border-brand-500')
    expect(applyButton).toContain('hover:bg-brand-500/12')
    expect(applyButton).toContain('focus-visible:ring-2')
  })

  it('does not spell out obvious PDF preview affordances in document rows', () => {
    const source = readProjectFile('app/components/CandidateDocumentsPanel.vue')

    expect(source).not.toContain('Click to preview')
    expect(source).toContain('title="Preview PDF"')
  })

  it('uses square icon buttons for document preview and download actions', () => {
    const source = readProjectFile('app/components/CandidateDocumentsPanel.vue')

    expect(source).toContain('title="Preview PDF"')
    expect(source).toContain('title="Download"')
    expect(source.match(/inline-flex size-9 min-h-9 cursor-pointer items-center justify-center border p-0/g)?.length).toBeGreaterThanOrEqual(2)
    expect(source).not.toContain('p-1.5 text-white/58')
  })

  it('keeps the apply-to-job modal above drawer overlays', () => {
    const drawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const shell = readProjectFile('app/components/AppDetailDrawerShell.vue')
    const modal = readProjectFile('app/components/ApplicationLinkModal.vue')

    expect(drawer).toContain('<AppDetailDrawerShell')
    expect(shell).toContain('z-[55]')
    expect(shell).toContain('z-[60]')
    expect(modal).toContain('z-[90]')
  })

  it('gives the apply-to-job modal a real dashboard layout', () => {
    const modal = readProjectFile('app/components/ApplicationLinkModal.vue')

    expect(modal).toContain('max-w-lg')
    expect(modal).toContain('max-h-[60vh] overflow-y-auto p-5')
    expect(modal).toContain('Choose an open role for this candidate.')
    expect(modal).toContain('group flex w-full cursor-pointer items-center justify-between')
    expect(modal).toContain('factory-button-cta factory-button-cta-sm')
    expect(modal).toContain('<AppModalShell')
    expect(modal).not.toContain('ui-modal-frame')
    expect(modal).not.toContain('ui-modal-list-row')
  })

  it('exposes accessible candidate detail tabs with keyboard navigation in drawer and page', () => {
    const drawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const page = readProjectFile('app/pages/dashboard/candidates/[id].vue')

    for (const source of [drawer, page]) {
      expect(source).toContain('role="tablist"')
      expect(source).toContain('role="tab"')
      expect(source).toContain(':aria-selected="activeTab === \'applications\'"')
      expect(source).toContain(':aria-selected="activeTab === \'documents\'"')
      expect(source).toContain('handleCandidateTabKeydown')
      expect(source).toContain("event.key === 'ArrowRight'")
      expect(source).toContain("event.key === 'ArrowLeft'")
    }
  })

  it('keeps status transitions on the full candidate page aligned with the drawer', () => {
    const drawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const page = readProjectFile('app/pages/dashboard/candidates/[id].vue')

    for (const source of [drawer, page]) {
      expect(source).toContain('show-status-transitions')
      expect(source).toContain('useApplicationStatusActions')
      expect(source).toContain('transitioningApplicationIds')
      expect(source).toContain('patchApplication')
      expect(source).toContain('@transition="handleApplicationTransition"')
    }
  })
})
