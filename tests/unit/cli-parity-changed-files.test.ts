import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { evaluateCliParityEvidence } from '../../scripts/cli-parity-check'

describe('CLI parity changed-file guard', () => {
  it('passes for UI-only portal changes without CLI evidence', () => {
    const result = evaluateCliParityEvidence([
      'app/components/AiProviderLogo.vue',
      'app/composables/useColorMode.ts',
      'app/pages/dashboard/settings/index.vue',
    ])

    expect(result).toMatchObject({
      ok: true,
      message: 'No CLI parity-sensitive files changed.',
      paritySensitiveFiles: [],
    })
  })

  it('accepts explicit CLI parity evidence for UI-only candidate detail refactors', () => {
    expect(evaluateCliParityEvidence([
      'app/components/CandidateDetailsCard.vue',
      'app/pages/dashboard/candidates/[id].vue',
      'tests/unit/cli-parity-changed-files.test.ts',
    ])).toMatchObject({ ok: true })
  })

  it('accepts CLI parity evidence for server foundation refactors without contract changes', () => {
    expect(evaluateCliParityEvidence([
      'server/api/ai-config/index.get.ts',
      'server/api/candidates/[id]/properties/[propId].put.ts',
      'server/utils/authenticateSession.ts',
      'server/utils/orgScope.ts',
      'tests/unit/cli-parity-changed-files.test.ts',
    ])).toMatchObject({
      ok: true,
      message: 'CLI parity evidence found.',
    })
  })

  it('accepts CLI parity evidence for Epic 2 dashboard keepalive without contract changes', () => {
    expect(evaluateCliParityEvidence([
      'shared/dashboard-keepalive.ts',
      'app/pages/dashboard/jobs/index.vue',
      'app/pages/dashboard/candidates/index.vue',
      'app/layouts/dashboard.vue',
      'tests/unit/dashboard-keepalive.test.ts',
      'tests/unit/cli-parity-changed-files.test.ts',
    ])).toMatchObject({
      ok: true,
      message: 'CLI parity evidence found.',
    })
  })

  it('accepts CLI parity evidence for Epic 2 dashboard prefetch without contract changes', () => {
    expect(evaluateCliParityEvidence([
      'shared/dashboard-prefetch.ts',
      'app/composables/useDashboardWarmPrefetch.ts',
      'app/layouts/dashboard.vue',
      'app/router.options.ts',
      'nuxt.config.ts',
      'tests/unit/dashboard-prefetch.test.ts',
      'tests/unit/cli-parity-changed-files.test.ts',
    ])).toMatchObject({
      ok: true,
      message: 'CLI parity evidence found.',
    })
  })

  it('accepts CLI parity evidence for Epic 2 list API Nitro cache without contract changes', () => {
    expect(evaluateCliParityEvidence([
      'server/api/jobs/index.get.ts',
      'server/api/candidates/index.get.ts',
      'server/api/applications/index.get.ts',
      'server/api/interviews/index.get.ts',
      'server/api/dashboard/stats.get.ts',
      'server/utils/httpCache.ts',
      'tests/unit/list-api-cache.test.ts',
      'tests/unit/cli-parity-changed-files.test.ts',
    ])).toMatchObject({
      ok: true,
      message: 'CLI parity evidence found.',
    })
  })

  it('accepts CLI parity evidence for Epic 7 pagination and pipeline helpers without contract changes', () => {
    expect(evaluateCliParityEvidence([
      'server/api/candidates/index.get.ts',
      'server/api/applications/index.get.ts',
      'server/api/jobs/index.get.ts',
      'server/api/dashboard/stats.get.ts',
      'server/api/tracking-links/[id]/stats.get.ts',
      'server/api/source-tracking/stats.get.ts',
      'shared/application-status.ts',
      'tests/unit/cli-parity-changed-files.test.ts',
    ])).toMatchObject({
      ok: true,
      message: 'CLI parity evidence found.',
    })
  })

  it('accepts CLI parity evidence for Epic 7 server domain helpers without contract changes', () => {
    expect(evaluateCliParityEvidence([
      'server/api/activity-log/index.get.ts',
      'server/api/calendar/google/callback.get.ts',
      'server/api/calendar/google/connect.get.ts',
      'server/api/calendar/microsoft/callback.get.ts',
      'server/api/calendar/microsoft/connect.get.ts',
      'server/api/chatbot/agents/[id].patch.ts',
      'server/api/chatbot/agents/index.get.ts',
      'server/api/chatbot/agents/index.post.ts',
      'server/api/chatbot/folders/[id].patch.ts',
      'server/api/chatbot/folders/index.get.ts',
      'server/api/chatbot/folders/index.post.ts',
      'server/api/source-tracking/stats.get.ts',
      'server/api/tracking-links/[id]/stats.get.ts',
      'server/api/updates/apply.post.ts',
      'server/api/updates/changelog.get.ts',
      'server/api/updates/system.get.ts',
      'server/api/updates/version.get.ts',
      'server/utils/sourceAnalytics.ts',
      'server/utils/calendarOAuth.ts',
      'server/utils/chatbotDto.ts',
      'server/utils/activityLogEntries.ts',
      'server/utils/appVersion.ts',
      'tests/unit/cli-parity-changed-files.test.ts',
    ])).toMatchObject({
      ok: true,
      message: 'CLI parity evidence found.',
    })
  })

  it('accepts CLI parity evidence for public application validation ordering without contract changes', () => {
    expect(evaluateCliParityEvidence([
      'server/api/public/jobs/[slug]/apply.post.ts',
      'tests/unit/public-application-document-limit.test.ts',
      'tests/unit/cli-parity-changed-files.test.ts',
    ])).toMatchObject({
      ok: true,
      message: 'CLI parity evidence found.',
    })
  })

  it('accepts CLI parity evidence for security/code-scanning route cleanups without contract changes', () => {
    expect(evaluateCliParityEvidence([
      'server/api/applications/[id]/analyze.post.ts',
      'server/api/feedback.post.ts',
      'server/api/interviews/[id]/send-invitation.post.ts',
      'server/api/interviews/index.post.ts',
      'server/api/org-settings/index.patch.ts',
      'server/api/public/jobs/[slug].get.ts',
      'server/api/tracking-links/index.get.ts',
      'tests/unit/cli-parity-changed-files.test.ts',
    ])).toMatchObject({
      ok: true,
      message: 'CLI parity evidence found.',
    })
  })

  it('passes when parity-sensitive files include CLI evidence', () => {
    expect(evaluateCliParityEvidence([
      'server/api/jobs/index.post.ts',
      'packages/careers-cli/src/program.ts',
    ])).toMatchObject({ ok: true })
  })

  it('fails when parity-sensitive files lack CLI evidence', () => {
    const result = evaluateCliParityEvidence([
      'server/api/jobs/index.post.ts',
      'shared/status-transitions.ts',
    ])

    expect(result.ok).toBe(false)
    expect(result.message).toContain('CLI parity evidence is required')
    expect(result.paritySensitiveFiles).toEqual([
      'server/api/jobs/index.post.ts',
      'shared/status-transitions.ts',
    ])
  })

  it('allows an explicit override marker for non-impacting changes', () => {
    expect(evaluateCliParityEvidence([
      'server/api/jobs/index.get.ts',
    ], { override: true })).toMatchObject({ ok: true })
  })

  it('runs the CLI entrypoint when invoked through tsx with a relative script path', () => {
    expect(() => execFileSync(
      'npx',
      ['tsx', 'scripts/cli-parity-check.ts', '--stdin'],
      {
        cwd: process.cwd(),
        input: 'server/api/jobs/index.post.ts\n',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )).toThrow(/CLI parity evidence is required/)
  }, 15_000)
})
