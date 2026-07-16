import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getReleaseNotes, getUnreleasedItems } from '../../scripts/changelog-format.mjs'
import { validateChangelogPolicy } from '../../scripts/validate-changelog.mjs'

const validatorPath = join(process.cwd(), 'scripts/validate-changelog.mjs')
const extractorPath = join(process.cwd(), 'scripts/extract-release-notes.mjs')
const tempDirectories: string[] = []

const baseline = `# Changelog

## Unreleased

### Added

- Existing unreleased item.

### Security

- Unsupported category item.

## [1.0.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0) (2026-07-16)

Factory release context.

### Added

- Establish the Factory baseline.
`

function runGit(cwd: string, args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)

  return result.stdout.trim()
}

function createRepository(options: { withRemote?: boolean } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'factory-careers-changelog-policy-'))
  tempDirectories.push(cwd)

  runGit(cwd, ['init', '--initial-branch=main'])
  runGit(cwd, ['config', 'user.email', 'changelog-policy@example.com'])
  runGit(cwd, ['config', 'user.name', 'Changelog Policy'])
  writeFileSync(join(cwd, 'CHANGELOG.md'), baseline)
  writeFileSync(join(cwd, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2)}\n`)
  runGit(cwd, ['add', '.'])
  runGit(cwd, ['commit', '-m', 'chore: establish fixture baseline'])

  if (options.withRemote) {
    const remote = mkdtempSync(join(tmpdir(), 'factory-careers-changelog-policy-remote-'))
    tempDirectories.push(remote)
    runGit(remote, ['init', '--bare', '--initial-branch=main'])
    runGit(cwd, ['remote', 'add', 'origin', remote])
    runGit(cwd, ['tag', 'unrelated-tag'])
    runGit(cwd, ['push', '--set-upstream', 'origin', 'main'])
    runGit(cwd, ['push', 'origin', 'main:refs/heads/release/1.x'])
    runGit(cwd, ['push', 'origin', 'unrelated-tag'])
  }

  runGit(cwd, ['switch', '-c', 'feature'])
  return cwd
}

function commitChanges(cwd: string, files: Record<string, string>) {
  for (const [file, contents] of Object.entries(files))
    writeFileSync(join(cwd, file), contents)

  runGit(cwd, ['add', '.'])
  runGit(cwd, ['commit', '-m', 'feat: update fixture'])
}

function runValidator(cwd: string, overrides: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env }
  delete env.PR_PREFLIGHT_BASE_REF
  delete env.PR_PREFLIGHT_REMOTE
  delete env.CHANGELOG_SKIP
  Object.assign(env, overrides)

  return spawnSync(process.execPath, [validatorPath], {
    cwd,
    encoding: 'utf8',
    env,
  })
}

function createExtractorFixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'factory-careers-release-notes-'))
  tempDirectories.push(cwd)
  writeFileSync(join(cwd, 'CHANGELOG.md'), baseline)
  return cwd
}

function runExtractor(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [extractorPath, ...args], {
    cwd,
    encoding: 'utf8',
  })
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

function validate(overrides: Partial<Parameters<typeof validateChangelogPolicy>[0]> = {}) {
  return validateChangelogPolicy({
    changedFiles: ['app/pages/dashboard/index.vue', 'CHANGELOG.md'],
    baseChangelog: baseline,
    currentChangelog: baseline.replace(
      '- Existing unreleased item.',
      '- Existing unreleased item.\n- Add recruiter reports.',
    ),
    baseVersion: '1.0.0',
    currentVersion: '1.0.0',
    skip: false,
    ...overrides,
  })
}

describe('changelog format', () => {
  it('returns only Unreleased bullets beneath supported categories', () => {
    expect(getUnreleasedItems(baseline)).toEqual(['Existing unreleased item.'])
  })

  it('extracts the exact Factory-owned version section body', () => {
    expect(getReleaseNotes(baseline, '1.0.0')).toBe(`Factory release context.

### Added

- Establish the Factory baseline.`)
  })

  it.each([
    'https://github.com/reqcore-inc/reqcore/releases/tag/v1.0.0) (2026-07-16',
    'https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0) (2026-02-30',
  ])('rejects a version section without a valid Factory release heading: %s', (heading) => {
    const invalid = baseline.replace(
      'https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0) (2026-07-16',
      heading,
    )

    expect(() => getReleaseNotes(invalid, '1.0.0')).toThrow('matching Factory release section')
  })

  it('extracts from the valid heading when an invalid same-version heading appears first', () => {
    const invalidHeading = `## [1.0.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0) (2026-02-30)

### Fixed

- Invalid release section.

`
    const withInvalidHeading = baseline.replace('## [1.0.0](', `${invalidHeading}## [1.0.0](`)

    expect(getReleaseNotes(withInvalidHeading, '1.0.0')).toBe(`Factory release context.

### Added

- Establish the Factory baseline.`)
  })

  it('rejects duplicate exact Unreleased headings', () => {
    const duplicate = baseline.replace(
      '## [1.0.0](',
      `## Unreleased

### Fixed

- Hidden by the first Unreleased section.

## [1.0.0](`,
    )

    expect(() => getUnreleasedItems(duplicate)).toThrow('exactly one ## Unreleased heading')
  })

  it('rejects duplicate valid headings for the requested version', () => {
    const duplicate = `${baseline}

## [1.0.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0) (2026-07-17)

### Fixed

- Duplicate release section.
`

    expect(() => getReleaseNotes(duplicate, '1.0.0')).toThrow('exactly one matching Factory release section')
  })
})

describe('changelog policy', () => {
  it('accepts an ordinary pull request with a new Unreleased item', () => {
    expect(validate()).toBe('pull-request')
  })

  it('rejects an ordinary pull request without a changelog update', () => {
    expect(() => validate({
      changedFiles: ['app/pages/dashboard/index.vue'],
      currentChangelog: baseline,
    })).toThrow('Add a new CHANGELOG.md item under ## Unreleased')
  })

  it('rejects a duplicate-only Unreleased bullet addition', () => {
    expect(() => validate({
      currentChangelog: baseline.replace(
        '- Existing unreleased item.',
        '- Existing unreleased item.\n- Existing unreleased item.',
      ),
    })).toThrow('Add a new CHANGELOG.md item under ## Unreleased')
  })

  it('rejects a changelog-only edit outside Unreleased', () => {
    expect(() => validate({
      changedFiles: ['CHANGELOG.md'],
      currentChangelog: baseline.replace('# Changelog', '# Factory Careers changelog'),
    })).toThrow('Add a new CHANGELOG.md item under ## Unreleased')
  })

  it('allows an ordinary pull request to skip the changelog policy', () => {
    expect(validate({
      changedFiles: ['tests/unit/example.test.ts'],
      currentChangelog: baseline,
      skip: true,
    })).toBe('skipped')
  })

  it('accepts a finalized version bump even when skip is requested', () => {
    const finalized = baseline.replace(
      `## Unreleased

### Added

- Existing unreleased item.

### Security

- Unsupported category item.`,
      `## Unreleased

## [1.1.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.1.0) (2026-07-20)

### Added

- Existing unreleased item.`,
    )

    expect(validate({
      baseVersion: '1.0.0',
      currentVersion: '1.1.0',
      currentChangelog: finalized,
      skip: true,
    })).toBe('release')
  })

  it('rejects a release pull request with a populated Unreleased section', () => {
    const release = `${baseline}

## [1.1.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.1.0) (2026-07-20)

### Added

- Publish recruiter reports.
`

    expect(() => validate({
      baseVersion: '1.0.0',
      currentVersion: '1.1.0',
      currentChangelog: release,
      skip: true,
    })).toThrow('## Unreleased must be empty')
  })

  it('rejects a release pull request without its matching version section', () => {
    const emptyUnreleased = baseline.replace(
      `## Unreleased

### Added

- Existing unreleased item.

### Security

- Unsupported category item.`,
      '## Unreleased',
    )

    expect(() => validate({
      baseVersion: '1.0.0',
      currentVersion: '1.1.0',
      currentChangelog: emptyUnreleased,
    })).toThrow('matching Factory release section')
  })

  it('rejects a release pull request that reuses a version section from the base', () => {
    const reusedSection = baseline.replace(
      `## Unreleased

### Added

- Existing unreleased item.

### Security

- Unsupported category item.`,
      `## Unreleased

## [1.1.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.1.0) (2026-07-20)

### Added

- Existing release note.`,
    )

    expect(() => validate({
      baseChangelog: reusedSection,
      currentChangelog: reusedSection.replace('# Changelog', '# Factory Careers changelog'),
      baseVersion: '1.0.0',
      currentVersion: '1.1.0',
    })).toThrow('newly introduce')
  })

  it('rejects a release version downgrade', () => {
    const downgrade = baseline.replace(
      `## Unreleased

### Added

- Existing unreleased item.

### Security

- Unsupported category item.`,
      `## Unreleased

## [0.9.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v0.9.0) (2026-07-20)

### Added

- Existing unreleased item.`,
    )

    expect(() => validate({
      baseVersion: '1.0.0',
      currentVersion: '0.9.0',
      currentChangelog: downgrade,
    })).toThrow('greater than base version')
  })

  it('rejects a release that does not promote the base Unreleased items', () => {
    const unrelatedRelease = baseline.replace(
      `## Unreleased

### Added

- Existing unreleased item.

### Security

- Unsupported category item.`,
      `## Unreleased

## [1.1.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.1.0) (2026-07-20)

### Added

- Unrelated release note.`,
    )

    expect(() => validate({
      baseVersion: '1.0.0',
      currentVersion: '1.1.0',
      currentChangelog: unrelatedRelease,
    })).toThrow('promote every base Unreleased item')
  })

  it('returns no-changes when the pull request has no changed files', () => {
    expect(validate({ changedFiles: [] })).toBe('no-changes')
  })
})

describe('changelog commands', () => {
  it('exposes package scripts for validation and release-note extraction', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

    expect(packageJson.scripts['changelog:check']).toBe('node scripts/validate-changelog.mjs')
    expect(packageJson.scripts['changelog:extract']).toBe('node scripts/extract-release-notes.mjs')
  })

  it('compares against the configured base ref and accepts a genuinely new Unreleased item', () => {
    const cwd = createRepository()
    commitChanges(cwd, {
      'CHANGELOG.md': baseline.replace(
        '- Existing unreleased item.',
        '- Existing unreleased item.\n- Add recruiter reports.',
      ),
      'feature.txt': 'new behavior\n',
    })

    const result = runValidator(cwd, { PR_PREFLIGHT_BASE_REF: 'main' })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe('Changelog policy passed (pull-request).\n')
    expect(result.stderr).toBe('')
  })

  it('fetches a missing default remote base without fetching tags', () => {
    const cwd = createRepository({ withRemote: true })
    commitChanges(cwd, {
      'CHANGELOG.md': baseline.replace(
        '- Existing unreleased item.',
        '- Existing unreleased item.\n- Add candidate exports.',
      ),
    })
    runGit(cwd, ['branch', '--delete', '--force', 'main'])
    runGit(cwd, ['update-ref', '-d', 'refs/remotes/origin/main'])
    runGit(cwd, ['tag', '--delete', 'unrelated-tag'])

    const result = runValidator(cwd)

    expect(result.status, result.stderr).toBe(0)
    expect(spawnSync('git', ['rev-parse', '--verify', 'origin/main'], { cwd }).status).toBe(0)
    expect(spawnSync('git', ['rev-parse', '--verify', 'refs/tags/unrelated-tag'], { cwd }).status).not.toBe(0)
  })

  it.each([
    { baseRef: 'main', resolvedRef: 'origin/main' },
    { baseRef: 'release/1.x', resolvedRef: 'origin/release/1.x' },
    { baseRef: 'refs/heads/release/1.x', resolvedRef: 'origin/release/1.x' },
    { baseRef: 'origin/release/1.x', resolvedRef: 'origin/release/1.x' },
  ])('fetches missing $baseRef into resolvable $resolvedRef', ({ baseRef, resolvedRef }) => {
    const cwd = createRepository({ withRemote: true })
    commitChanges(cwd, {
      'CHANGELOG.md': baseline.replace(
        '- Existing unreleased item.',
        '- Existing unreleased item.\n- Add configurable base refs.',
      ),
    })
    runGit(cwd, ['update-ref', '-d', 'refs/heads/main'])
    runGit(cwd, ['update-ref', '-d', 'refs/heads/release/1.x'])
    runGit(cwd, ['update-ref', '-d', 'refs/remotes/origin/main'])
    runGit(cwd, ['update-ref', '-d', 'refs/remotes/origin/release/1.x'])

    const result = runValidator(cwd, { PR_PREFLIGHT_BASE_REF: baseRef })

    expect(result.status, result.stderr).toBe(0)
    expect(spawnSync('git', ['rev-parse', '--verify', resolvedRef], { cwd }).status).toBe(0)
  })

  it('does not fetch base refs that already resolve locally', () => {
    const cwd = createRepository({ withRemote: true })
    const baseSha = runGit(cwd, ['rev-parse', 'main'])
    runGit(cwd, ['branch', 'release/1.x', 'main'])
    runGit(cwd, [
      'fetch',
      '--no-tags',
      'origin',
      '+refs/heads/release/1.x:refs/remotes/origin/release/1.x',
    ])
    commitChanges(cwd, {
      'CHANGELOG.md': baseline.replace(
        '- Existing unreleased item.',
        '- Existing unreleased item.\n- Avoid unnecessary base fetches.',
      ),
    })
    runGit(cwd, ['remote', 'set-url', 'origin', join(cwd, 'missing-remote.git')])

    for (const baseRef of [
      'main',
      'release/1.x',
      'refs/heads/release/1.x',
      'origin/release/1.x',
      baseSha,
    ]) {
      const result = runValidator(cwd, { PR_PREFLIGHT_BASE_REF: baseRef })
      expect(result.status, `${baseRef}: ${result.stderr}`).toBe(0)
    }
  })

  it('fetches a missing explicit SHA before comparing against it', () => {
    const cwd = createRepository({ withRemote: true })
    const baseSha = runGit(cwd, ['rev-parse', 'main'])
    commitChanges(cwd, {
      'CHANGELOG.md': baseline.replace(
        '- Existing unreleased item.',
        '- Existing unreleased item.\n- Compare against fetched commits.',
      ),
    })
    runGit(cwd, ['update-ref', '-d', 'refs/heads/main'])
    runGit(cwd, ['update-ref', '-d', 'refs/remotes/origin/main'])
    rmSync(join(cwd, '.git', 'objects', baseSha.slice(0, 2), baseSha.slice(2)))
    expect(spawnSync('git', ['rev-parse', '--verify', `${baseSha}^{commit}`], { cwd }).status).not.toBe(0)

    const result = runValidator(cwd, { PR_PREFLIGHT_BASE_REF: baseSha })

    expect(result.status, result.stderr).toBe(0)
    expect(spawnSync('git', ['rev-parse', '--verify', `${baseSha}^{commit}`], { cwd }).status).toBe(0)
  })

  it('reports a missing Unreleased entry with an actionable error', () => {
    const cwd = createRepository()
    commitChanges(cwd, { 'feature.txt': 'new behavior\n' })

    const result = runValidator(cwd, { PR_PREFLIGHT_BASE_REF: 'main' })

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('changelog:check: Add a new CHANGELOG.md item under ## Unreleased')
  })

  it('honors CHANGELOG_SKIP=true for an ordinary pull request', () => {
    const cwd = createRepository()
    commitChanges(cwd, { 'feature.txt': 'new behavior\n' })

    const result = runValidator(cwd, {
      PR_PREFLIGHT_BASE_REF: 'main',
      CHANGELOG_SKIP: 'true',
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe('Changelog policy passed (skipped).\n')
  })

  it('does not let CHANGELOG_SKIP=true bypass a release pull request', () => {
    const cwd = createRepository()
    commitChanges(cwd, {
      'package.json': `${JSON.stringify({ name: 'fixture', version: '1.1.0' }, null, 2)}\n`,
    })

    const result = runValidator(cwd, {
      PR_PREFLIGHT_BASE_REF: 'main',
      CHANGELOG_SKIP: 'true',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('changelog:check: Release pull requests must update CHANGELOG.md')
  })

  it('writes only the matching release body to stdout', () => {
    const cwd = createExtractorFixture()

    const result = runExtractor(cwd, ['1.0.0'])

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe(`Factory release context.

### Added

- Establish the Factory baseline.\n`)
    expect(result.stderr).toBe('')
  })

  it('keeps the public silent npm extraction command safe for stdout redirection', () => {
    const expected = `${getReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), '1.0.0')}\n`
    const result = spawnSync('npm', [
      'run',
      '--silent',
      'changelog:extract',
      '--',
      '1.0.0',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe(expected)
    expect(result.stderr).toBe('')
  })

  it('rejects an unknown release version', () => {
    const cwd = createExtractorFixture()

    const result = runExtractor(cwd, ['2.0.0'])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('changelog:extract: CHANGELOG.md must contain a matching Factory release section for v2.0.0')
  })

  it.each([
    { args: [] },
    { args: ['v1.0.0'] },
    { args: ['1.0'] },
    { args: ['1.0.0', 'extra'] },
  ])('rejects invalid release arguments: $args', ({ args }) => {
    const cwd = createExtractorFixture()

    const result = runExtractor(cwd, args)

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('changelog:extract: usage: npm run --silent changelog:extract -- <MAJOR.MINOR.PATCH>')
  })
})
