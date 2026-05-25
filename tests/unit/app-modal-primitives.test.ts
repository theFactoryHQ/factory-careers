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
    ]) {
      expect(shell).toContain(className)
    }
  })

  it('keeps the shared dashboard modal panel frame in AppModalPanel', () => {
    const panel = readProjectFile('app/components/AppModalPanel.vue')

    expect(panel).toContain('ui-modal-panel relative w-full')
  })

  it('prevents dashboard modals from reintroducing pasted shell classes', () => {
    const migratedFiles = [
      'app/components/CandidateDetailSidebar.vue',
      'app/components/ChatbotAgentManagerModal.vue',
      'app/components/FeedbackModal.vue',
      'app/components/InterviewEmailModal.vue',
      'app/components/JobSubNavActions.vue',
      'app/components/PreviewUpsellModal.vue',
      'app/pages/dashboard/interviews/[id].vue',
      'app/pages/dashboard/interviews/index.vue',
      'app/pages/dashboard/jobs/[id]/application-form.vue',
      'app/pages/dashboard/source-tracking/[id].vue',
      'app/pages/dashboard/source-tracking/index.vue',
    ]

    for (const file of migratedFiles) {
      const source = readProjectFile(file)

      expect(source, file).toContain('<AppModalShell')
      expect(source, file).toContain('<AppModalPanel')
      expect(source, file).not.toContain('factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50')
    }
  })
})
