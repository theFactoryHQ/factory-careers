import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('dashboard modal primitives', () => {
  it('keeps the shared dashboard modal shell anatomy in AppModalShell', () => {
    const shell = readProjectFile('app/components/AppModalShell.vue')

    for (const className of [
      'factory-dashboard-portal ui-modal-backdrop fixed inset-0',
      'grid place-items-center',
      'flex items-center justify-center',
      'p-4',
      'z-50',
      'useFocusTrap',
      "role: 'dialog'",
      "'aria-modal': true",
      "ariaLabel: 'Dialog'",
      "rest['aria-label'] || rest['aria-labelledby']",
    ]) {
      expect(shell).toContain(className)
    }
  })

  it('keeps the shared dashboard modal panel frame in AppModalPanel', () => {
    const panel = readProjectFile('app/components/AppModalPanel.vue')

    expect(panel).toContain('ui-modal-panel relative w-full')
  })

  it('prevents dashboard modals from reintroducing pasted shell classes', () => {
    const directModalFiles = [
      'app/components/ChatbotAgentManagerModal.vue',
      'app/components/FeedbackModal.vue',
      'app/components/InterviewEmailModal.vue',
      'app/components/PreviewUpsellModal.vue',
      'app/pages/dashboard/jobs/[id]/application-form.vue',
      'app/pages/dashboard/source-tracking/[id].vue',
      'app/pages/dashboard/source-tracking/index.vue',
    ]

    const confirmDialogFiles = [
      'app/components/CandidateDetailSidebar.vue',
      'app/components/JobSubNavActions.vue',
      'app/pages/dashboard/candidates/[id].vue',
      'app/pages/dashboard/emails/templates/index.vue',
      'app/pages/dashboard/interviews/[id].vue',
      'app/pages/dashboard/interviews/index.vue',
    ]

    for (const file of directModalFiles) {
      const source = readProjectFile(file)

      expect(source, file).toContain('<AppModalShell')
      expect(source, file).toContain('<AppModalPanel')
      expect(source, file).not.toContain('factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50')
    }

    for (const file of confirmDialogFiles) {
      const source = readProjectFile(file)

      expect(source, file).toContain('<ConfirmDialog')
      expect(source, file).not.toContain('factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50')
    }
  })

  it('keeps ConfirmDialog built on the shared modal shell with danger actions', () => {
    const confirm = readProjectFile('app/components/ConfirmDialog.vue')

    for (const snippet of [
      '<AppModalShell',
      '<AppModalPanel',
      'title: string',
      'confirmLabel',
      'cancelLabel',
      "variant?: 'danger' | 'default'",
      'ui-button-danger',
      'ui-button-secondary',
      "emit('close')",
      "emit('confirm')",
      'showDangerIcon',
      'closeOnBackdrop',
    ]) {
      expect(confirm, snippet).toContain(snippet)
    }
  })

  it('routes dashboard delete confirmations through ConfirmDialog', () => {
    const migratedFiles = [
      'app/pages/dashboard/source-tracking/index.vue',
      'app/pages/dashboard/jobs/[id]/application-form.vue',
      'app/pages/dashboard/candidates/[id].vue',
      'app/pages/dashboard/emails/templates/index.vue',
      'app/pages/dashboard/interviews/index.vue',
      'app/pages/dashboard/interviews/[id].vue',
      'app/components/CandidateDetailSidebar.vue',
      'app/components/JobSubNavActions.vue',
    ]

    for (const file of migratedFiles) {
      const source = readProjectFile(file)

      expect(source, file).toContain('<ConfirmDialog')
      expect(source, file).not.toContain('Delete Tracking Link?</h3>')
      expect(source, file).not.toContain('Delete Document</h3>')
      expect(source, file).not.toContain('Delete Template</h3>')
    }
  })

  it('keeps shared modal close controls accessible by name', () => {
    const labeledCloseButtons = [
      ['app/components/FeedbackModal.vue', 'aria-label="Close feedback modal"'],
      ['app/components/InterviewEmailModal.vue', 'aria-label="Close interview invitation modal"'],
      ['app/components/ChatbotAgentManagerModal.vue', 'aria-label="Close agent manager modal"'],
      ['app/components/PreviewUpsellModal.vue', 'aria-label="Close preview upsell modal"'],
    ]

    for (const [file, label] of labeledCloseButtons) {
      expect(readProjectFile(file), file).toContain(label)
    }
  })
})
