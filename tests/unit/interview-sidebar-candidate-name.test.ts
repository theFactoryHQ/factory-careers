import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

const interviewSidebarCallSites = [
  'app/components/ApplicationDetailDrawer.vue',
  'app/components/CandidateDetailDrawer.vue',
  'app/components/CandidateDetailSidebar.vue',
  'app/pages/dashboard/candidates/[id].vue',
  'app/pages/dashboard/applications/[id].vue',
]

describe('InterviewScheduleSidebar candidate-name formatting', () => {
  it('uses formatCandidateName for candidate-name props instead of raw first/last concatenation', () => {
    for (const path of interviewSidebarCallSites) {
      const source = readProjectFile(path)

      expect(source, `${path} should import formatCandidateName from useOrgSettings`).toContain('formatCandidateName')
      expect(
        source,
        `${path} should pass formatCandidateName to InterviewScheduleSidebar`,
      ).toMatch(/:candidate-name="formatCandidateName\(/)
      expect(
        source,
        `${path} should not concatenate firstName and lastName for candidate-name`,
      ).not.toMatch(/:candidate-name="`\$\{[^}]*firstName[^}]*\}\s*\$\{[^}]*lastName/)
    }
  })
})