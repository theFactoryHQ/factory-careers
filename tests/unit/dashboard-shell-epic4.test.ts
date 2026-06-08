import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('dashboard shell epic 4', () => {
  it('keeps shared drawer shell primitives grounded in repo files', () => {
    const shell = readProjectFile('app/components/AppDetailDrawerShell.vue')
    const candidateDrawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const applicationDrawer = readProjectFile('app/components/ApplicationDetailDrawer.vue')

    for (const snippet of [
      'useFocusTrap',
      'previousBodyOverflow',
      'document.body.style.overflow = previousBodyOverflow',
      'factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-[55]',
      'fixed inset-y-0 right-0 z-[60]',
      'Open full page',
      '<slot name="overlays" />',
    ]) {
      expect(shell, snippet).toContain(snippet)
    }

    for (const drawer of [candidateDrawer, applicationDrawer]) {
      expect(drawer).toContain('<AppDetailDrawerShell')
      expect(drawer).not.toContain('document.body.style.overflow = \'hidden\'')
      expect(drawer).not.toContain('factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-[55]')
    }
  })

  it('routes apply flows through ApplicationLinkModal with shared modal shell', () => {
    const modal = readProjectFile('app/components/ApplicationLinkModal.vue')
    const candidateDrawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const candidatePage = readProjectFile('app/pages/dashboard/candidates/[id].vue')
    const jobActions = readProjectFile('app/components/JobSubNavActions.vue')

    for (const snippet of [
      "mode: 'job' | 'candidate'",
      '<AppModalShell',
      '<AppModalPanel',
      'useDebouncedRef',
      'import.meta.dev',
      'ApplicationLinkModal requires candidateId when mode is "job".',
      'ApplicationLinkModal requires jobId when mode is "candidate".',
      'immediate: props.mode === \'job\'',
      'immediate: props.mode === \'candidate\'',
      'Choose an open role for this candidate.',
      'Search candidates by name or email',
    ]) {
      expect(modal, snippet).toContain(snippet)
    }

    expect(candidateDrawer).toContain('<ApplicationLinkModal')
    expect(candidateDrawer).toContain('mode="job"')
    expect(candidatePage).toContain('<ApplicationLinkModal')
    expect(jobActions).toContain('<ApplicationLinkModal')
    expect(jobActions).toContain('mode="candidate"')
    expect(modal).toContain("resolvedZIndexClass = computed(() => props.zIndexClass ?? (props.mode === 'job' ? 'z-[90]' : 'z-50'))")
  })

  it('uses shared status actions in the candidate detail drawer', () => {
    const drawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const statusActions = readProjectFile('app/composables/useApplicationStatusActions.ts')

    expect(drawer).toContain('useApplicationStatusActions')
    expect(drawer).toContain('transitioningApplicationIds')
    expect(drawer).toContain('transitionKey: computed(() => transitionTarget.value?.id)')
    expect(drawer).not.toContain('handlePreviewReadOnlyError')
    expect(drawer).not.toContain('toast.error(\'Failed to update status\'')
    expect(statusActions).toContain('transitioningKeys?: Ref<Set<string>>')
    expect(statusActions).toContain('markTransitionStart')
  })
})