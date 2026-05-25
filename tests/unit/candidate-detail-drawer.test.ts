import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('candidate detail drawer', () => {
  it('puts compact icon-only application quick actions beside the status badge', () => {
    const source = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const badge = readProjectFile('app/components/ApplicationStatusBadge.vue')

    expect(source).toContain('APPLICATION_STATUS_TRANSITIONS')
    expect(source).toContain('getApplicationTransitionButtonClass(nextStatus, \'factory\')')
    expect(source).toContain('getApplicationTransitionActionLabel(nextStatus)')
    expect(source).toContain('<ApplicationTransitionIcon :status="nextStatus" class="size-3.5" />')
    expect(source).toContain('class="group/action relative inline-flex size-8')
    expect(source).toContain('const transitioningApplicationIds = ref<Set<string>>(new Set())')
    expect(source).toContain('if (transitioningApplicationIds.value.has(app.id)) return')
    expect(source).toContain(':disabled="transitioningApplicationIds.has(app.id)"')
    expect(source).toContain('aria-label="Schedule Interview"')
    expect(source).not.toContain('Schedule\n                    </button>')
    expect(source).toContain('<ApplicationStatusBadge :status="app.status" />')
    expect(badge).toContain('inline-flex h-8 min-h-8 shrink-0 items-center border')
  })

  it('keeps the apply-to-job button visibly interactive', () => {
    const source = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const applyButton = source.match(/<button[\s\S]*?@click="showApplyModal = true"[\s\S]*?>/)?.[0] ?? ''

    expect(applyButton).toContain('cursor-pointer')
    expect(applyButton).toContain('hover:border-brand-500')
    expect(applyButton).toContain('hover:bg-brand-500/12')
    expect(applyButton).toContain('focus-visible:ring-2')
  })

  it('does not spell out obvious PDF preview affordances in document rows', () => {
    const drawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const fullPage = readProjectFile('app/pages/dashboard/candidates/[id].vue')

    expect(drawer).not.toContain('Click to preview')
    expect(fullPage).not.toContain('Click to preview')
    expect(drawer).toContain('title="Preview PDF"')
    expect(fullPage).toContain('title="Preview PDF"')
  })

  it('uses square icon buttons for document preview and download actions', () => {
    const drawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const documentActions = drawer.match(/<div class="flex items-center gap-1 shrink-0" @click\.stop>[\s\S]*?<\/div>/)?.[0] ?? ''

    expect(documentActions).toContain('title="Preview PDF"')
    expect(documentActions).toContain('title="Download"')
    expect(documentActions.match(/inline-flex size-9 min-h-9 cursor-pointer items-center justify-center border p-0/g)?.length).toBeGreaterThanOrEqual(2)
    expect(documentActions).not.toContain('p-1.5 text-white/58')
  })

  it('keeps the apply-to-job modal above drawer overlays', () => {
    const drawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const modal = readProjectFile('app/components/ApplyToJobModal.vue')

    expect(drawer).toContain('z-[55]')
    expect(drawer).toContain('z-[60]')
    expect(modal).toContain('z-[90]')
  })

  it('gives the apply-to-job modal a real dashboard layout', () => {
    const modal = readProjectFile('app/components/ApplyToJobModal.vue')

    expect(modal).toContain('max-w-lg')
    expect(modal).toContain('max-h-[60vh] overflow-y-auto p-5')
    expect(modal).toContain('Choose an open role for this candidate.')
    expect(modal).toContain('group flex w-full cursor-pointer items-center justify-between')
    expect(modal).toContain('factory-button-cta factory-button-cta-sm')
    expect(modal).not.toContain('ui-modal-frame')
    expect(modal).not.toContain('ui-modal-list-row')
  })
})
