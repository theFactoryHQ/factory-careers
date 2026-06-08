import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('applicant email copy behavior', () => {
  it('uses a shared inline copy control for applicant email displays', () => {
    const component = readProjectFile('app/components/CopyEmailButton.vue')

    expect(component).toContain('useCopyToClipboard({ useFallback: true })')
    expect(component).toContain("toast.success('Email copied', email)")
    expect(component).not.toContain('mailto:')
  })

  it('does not use mailto links for applicant or candidate email displays', () => {
    const applicantEmailFiles = [
      'app/pages/dashboard/candidates/index.vue',
      'app/components/CandidateDetailsCard.vue',
      'app/components/CandidateDetailSidebar.vue',
      'app/components/ApplicationDetailDrawer.vue',
      'app/pages/dashboard/applications/index.vue',
      'app/pages/dashboard/applications/[id].vue',
      'app/pages/dashboard/interviews/[id].vue',
      'app/pages/dashboard/jobs/[id]/candidates.vue',
      'app/pages/dashboard/jobs/[id]/index.vue',
      'app/components/PipelineCard.vue',
      'app/pages/dashboard/source-tracking/index.vue',
      'app/pages/dashboard/source-tracking/[id].vue',
    ]

    for (const path of applicantEmailFiles) {
      const source = readProjectFile(path)

      expect(source, `${path} should use the shared copy email control`).toContain('CopyEmailButton')
      expect(source, `${path} should not use mailto links for applicants`).not.toContain('mailto:')
    }

    for (const path of [
      'app/pages/dashboard/candidates/[id].vue',
      'app/components/CandidateDetailDrawer.vue',
    ]) {
      const source = readProjectFile(path)

      expect(source, `${path} should use the shared candidate details card`).toContain('CandidateDetailsCard')
      expect(source, `${path} should not use mailto links for applicants`).not.toContain('mailto:')
    }
  })
})
