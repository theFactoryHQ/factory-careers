import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getFetchArgsForBaseRef, getPrPreflightSteps } from '../../scripts/run-pr-validation-preflight.mjs'
import { validateConventionalTitle } from '../../scripts/validate-conventional-title.mjs'
import { getPrTitleValidationStatus } from '../../scripts/validate-current-pr-title.mjs'

const tempDirectories: string[] = []

function createGitRepository(remotes: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), 'factory-careers-preflight-remotes-'))
  tempDirectories.push(cwd)

  const init = spawnSync('git', ['init', '--quiet'], { cwd, encoding: 'utf8' })
  if (init.status !== 0)
    throw new Error(`git init failed: ${init.stderr}`)

  for (const remote of remotes) {
    const result = spawnSync('git', ['remote', 'add', remote, join(cwd, `${remote}.git`)], {
      cwd,
      encoding: 'utf8',
    })
    if (result.status !== 0)
      throw new Error(`git remote add ${remote} failed: ${result.stderr}`)
  }

  return cwd
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

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
      'Changelog policy',
      'CLI parity evidence',
      'Unit tests',
      'Lint',
      'Typecheck',
      'CLI smoke tests',
      'Production environment contract',
      'Build',
    ])
  })

  it('runs the changelog policy through its local preflight alias', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'factory-careers-preflight-changelog-'))
    const capturePath = join(cwd, 'npm-args.txt')
    const fakeNpmPath = join(cwd, 'npm')
    tempDirectories.push(cwd)

    writeFileSync(fakeNpmPath, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$CAPTURE_FILE"\n')
    chmodSync(fakeNpmPath, 0o755)

    const result = spawnSync('node', ['scripts/run-pr-validation-preflight.mjs', '--step', 'changelog'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CAPTURE_FILE: capturePath,
        PATH: `${cwd}:${process.env.PATH ?? ''}`,
      },
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('==> Changelog policy')
    expect(readFileSync(capturePath, 'utf8')).toBe('run\nchangelog:check\n')
    expect(getPrPreflightSteps()[0]?.aliases).toEqual(['changelog'])
  })

  it('installs all local hooks from npm prepare', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

    expect(packageJson.scripts.prepare).toBe('node scripts/install-git-hooks.mjs')
    expect(readFileSync('.githooks/commit-msg', 'utf8')).toContain('validate-conventional-title.mjs')
    expect(readFileSync('.githooks/pre-push', 'utf8')).toContain('validate-current-pr-title.mjs')
    expect(readFileSync('.githooks/pre-push', 'utf8')).toContain('preflight:pr')
  })

  it('skips local PR title validation before a branch has an open PR', () => {
    expect(getPrTitleValidationStatus('', 'failed to find pull request')).toMatchObject({
      ok: true,
      skipped: true,
    })
  })

  it('skips local PR title validation when gh is not installed', () => {
    expect(getPrTitleValidationStatus('', '', { code: 'ENOENT', message: 'spawnSync gh ENOENT' })).toMatchObject({
      ok: true,
      skipped: true,
    })
  })

  it('rejects the current PR title when it would fail the PR title workflow', () => {
    expect(getPrTitleValidationStatus('[codex] skip heavyweight CI for draft PRs', '')).toMatchObject({
      ok: false,
      skipped: false,
    })
  })

  it('fetches the configured base ref instead of hard-coding main', () => {
    const originOnly = createGitRepository(['origin'])
    const originAndUpstream = createGitRepository(['origin', 'upstream'])

    expect(getFetchArgsForBaseRef('main', 'origin', { cwd: originOnly })).toEqual([
      '--no-tags',
      'origin',
      '+refs/heads/main:refs/remotes/origin/main',
    ])
    expect(getFetchArgsForBaseRef('release/1.x', 'origin', { cwd: originOnly })).toEqual([
      '--no-tags',
      'origin',
      '+refs/heads/release/1.x:refs/remotes/origin/release/1.x',
    ])
    expect(getFetchArgsForBaseRef('refs/heads/release/1.x', 'origin', { cwd: originOnly })).toEqual([
      '--no-tags',
      'origin',
      '+refs/heads/release/1.x:refs/remotes/origin/release/1.x',
    ])
    expect(getFetchArgsForBaseRef('origin/release/1.4', 'origin', { cwd: originOnly })).toEqual([
      '--no-tags',
      'origin',
      '+refs/heads/release/1.4:refs/remotes/origin/release/1.4',
    ])
    expect(getFetchArgsForBaseRef('upstream/main', 'origin', { cwd: originAndUpstream })).toEqual([
      '--no-tags',
      'upstream',
      '+refs/heads/main:refs/remotes/upstream/main',
    ])
    expect(getFetchArgsForBaseRef('release/1.x', 'upstream', { cwd: originAndUpstream })).toEqual([
      '--no-tags',
      'upstream',
      '+refs/heads/release/1.x:refs/remotes/upstream/release/1.x',
    ])
  })

  it('treats an unconfigured remote-like prefix as a branch on origin', () => {
    const originOnly = createGitRepository(['origin'])

    expect(getFetchArgsForBaseRef('upstream/main', 'origin', { cwd: originOnly })).toEqual([
      '--no-tags',
      'origin',
      '+refs/heads/upstream/main:refs/remotes/origin/upstream/main',
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
