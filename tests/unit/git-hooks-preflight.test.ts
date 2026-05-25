import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { getFetchArgsForBaseRef, getPrPreflightSteps } from '../../scripts/run-pr-validation-preflight.mjs'
import { validateConventionalTitle } from '../../scripts/validate-conventional-title.mjs'

describe('git hook preflight checks', () => {
  it('accepts PR-title-compatible conventional commit subjects', () => {
    expect(validateConventionalTitle('fix: prevent duplicate settings')).toMatchObject({ ok: true })
    expect(validateConventionalTitle('feat(jobs): add bulk import')).toMatchObject({ ok: true })
    expect(validateConventionalTitle('security: tighten session cookies')).toMatchObject({ ok: true })
  })

  it('rejects titles that would fail the PR title workflow', () => {
    expect(validateConventionalTitle('Update stuff')).toMatchObject({ ok: false })
    expect(validateConventionalTitle('fix:')).toMatchObject({ ok: false })
    expect(validateConventionalTitle('fix: - starts with punctuation')).toMatchObject({ ok: false })
  })

  it('accepts lowercase conventional commit subjects', () => {
    expect(validateConventionalTitle('fix: add lowercase subject')).toMatchObject({ ok: true })
  })

  it('keeps local pre-push checks aligned with PR validation', () => {
    expect(getPrPreflightSteps().map((step) => step.name)).toEqual([
      'CLI parity evidence',
      'Unit tests',
      'Lint',
      'Typecheck',
      'CLI smoke tests',
      'Production environment contract',
      'Build',
    ])
  })

  it('installs all local hooks from npm prepare', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

    expect(packageJson.scripts.prepare).toBe('node scripts/install-git-hooks.mjs')
    expect(readFileSync('.githooks/commit-msg', 'utf8')).toContain('validate-conventional-title.mjs')
    expect(readFileSync('.githooks/pre-push', 'utf8')).toContain('preflight:pr')
  })

  it('fetches the configured base ref instead of hard-coding main', () => {
    expect(getFetchArgsForBaseRef('origin/release/1.4')).toEqual([
      '--no-tags',
      'origin',
      '+refs/heads/release/1.4:refs/remotes/origin/release/1.4',
    ])
    expect(getFetchArgsForBaseRef('upstream/main')).toEqual([
      '--no-tags',
      'upstream',
      '+refs/heads/main:refs/remotes/upstream/main',
    ])
  })

  it('fails clearly when the preflight step flag is missing a value', () => {
    const result = spawnSync('node', ['scripts/run-pr-validation-preflight.mjs', '--step'], {
      encoding: 'utf8',
      timeout: 2_000,
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Missing value for --step')
  })
})
