import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { evaluateCliParityEvidence } from '../../scripts/cli-parity-check'

describe('CLI parity changed-file guard', () => {
  it('passes when parity-sensitive files include CLI evidence', () => {
    expect(evaluateCliParityEvidence([
      'server/api/jobs/index.post.ts',
      'packages/careers-cli/src/program.ts',
    ])).toMatchObject({ ok: true })
  })

  it('fails when parity-sensitive files lack CLI evidence', () => {
    const result = evaluateCliParityEvidence([
      'server/api/jobs/index.post.ts',
      'app/pages/dashboard/jobs/new.vue',
    ])

    expect(result.ok).toBe(false)
    expect(result.message).toContain('CLI parity evidence is required')
    expect(result.paritySensitiveFiles).toEqual([
      'server/api/jobs/index.post.ts',
      'app/pages/dashboard/jobs/new.vue',
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
  })
})
