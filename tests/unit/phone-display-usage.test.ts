import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('phone number display usage', () => {
  it('uses the shared phone formatter across dashboard phone displays', () => {
    const displayFiles = [
      'app/pages/dashboard/candidates/index.vue',
      'app/components/CandidateDetailsCard.vue',
      'app/components/CandidateDetailSidebar.vue',
      'app/components/ApplicationDetailDrawer.vue',
      'app/pages/dashboard/applications/[id].vue',
      'app/pages/dashboard/interviews/[id].vue',
      'app/pages/dashboard/jobs/[id]/index.vue',
    ]

    for (const path of displayFiles) {
      const source = readProjectFile(path)

      expect(source, `${path} should import the shared formatter`).toContain('formatPhoneNumber')
      expect(source, `${path} should not render raw phone fields`).not.toMatch(
        /\{\{\s*(?:c\.phone|candidate\.phone|application\.candidate\.phone|interview\.candidatePhone|resolvedCurrentApplication\.candidate\.phone)\s*(?:\|\|\s*'—')?\s*\}\}/,
      )
    }

    for (const path of [
      'app/pages/dashboard/candidates/[id].vue',
      'app/components/CandidateDetailDrawer.vue',
    ]) {
      const source = readProjectFile(path)

      expect(source, `${path} should use the shared candidate details card`).toContain('CandidateDetailsCard')
      expect(source, `${path} should not render raw phone fields`).not.toMatch(
        /\{\{\s*(?:c\.phone|candidate\.phone|application\.candidate\.phone|interview\.candidatePhone|resolvedCurrentApplication\.candidate\.phone)\s*(?:\|\|\s*'—')?\s*\}\}/,
      )
    }
  })
})
