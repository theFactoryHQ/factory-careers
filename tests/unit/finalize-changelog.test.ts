import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = join(process.cwd(), 'scripts/finalize-changelog.mjs')
const tempDirectories: string[] = []

function createFixture(changelog: string): string {
  const cwd = mkdtempSync(join(tmpdir(), 'factory-careers-changelog-'))
  tempDirectories.push(cwd)
  writeFileSync(join(cwd, 'CHANGELOG.md'), changelog)
  return cwd
}

function runFinalizer(cwd: string, version = '1.1.0', date = '2026-07-20') {
  return spawnSync(process.execPath, [scriptPath, version, date], {
    cwd,
    encoding: 'utf8',
  })
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe('finalize-changelog', () => {
  it('atomically promotes populated Unreleased sections into a Factory release', () => {
    const cwd = createFixture(`# Changelog

## Unreleased

### Added

- Add recruiter reports.

### Fixed

- Keep filters after refresh.

## [1.0.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0) (2026-07-16)

### Added

- Establish the Factory baseline.
`)

    const result = runFinalizer(cwd)

    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toBe(`# Changelog

## Unreleased

## [1.1.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.1.0) (2026-07-20)

### Added

- Add recruiter reports.

### Fixed

- Keep filters after refresh.

## [1.0.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0) (2026-07-16)

### Added

- Establish the Factory baseline.
`)
    expect(readdirSync(cwd)).toEqual(['CHANGELOG.md'])
  })

  it('preserves continuation paragraphs, nested lists, and fenced examples during promotion', () => {
    const original = `# Changelog

## Unreleased

### Changed

- Document the operator workflow.

  This continuation is part of the curated entry.

  - Run the first step.
  - Run the second step.

  \`\`\`md
- This fenced bullet is an example.
  \`\`\`
`
    const cwd = createFixture(original)

    const result = runFinalizer(cwd)

    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toContain(`### Changed

- Document the operator workflow.

  This continuation is part of the curated entry.

  - Run the first step.
  - Run the second step.

  \`\`\`md
- This fenced bullet is an example.
  \`\`\``)
  })

  it('refuses to finalize an empty Unreleased section and leaves the file unchanged', () => {
    const original = `# Changelog

## Unreleased

## [1.0.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0) (2026-07-16)

### Added

- Establish the Factory baseline.
`
    const cwd = createFixture(original)

    const result = runFinalizer(cwd)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unreleased must contain at least one changelog item')
    expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toBe(original)
    expect(readdirSync(cwd)).toEqual(['CHANGELOG.md'])
  })

  it('refuses to finalize Unreleased content under unsupported-only categories', () => {
    const original = `# Changelog

## Unreleased

### Security

- This category is outside the curated changelog grammar.
`
    const cwd = createFixture(original)

    const result = runFinalizer(cwd)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unreleased must contain at least one changelog item')
    expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toBe(original)
  })

  it.each([
    {
      source: 'a fenced code example',
      content: `\`\`\`md
- Example only.
\`\`\``,
    },
    {
      source: 'an HTML comment',
      content: `<!--
- Hidden example only.
-->`,
    },
  ])('refuses to treat a bullet inside $source as a changelog item', ({ content }) => {
    const original = `# Changelog

## Unreleased

### Added

${content}
`
    const cwd = createFixture(original)

    const result = runFinalizer(cwd)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unreleased must contain at least one changelog item')
    expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toBe(original)
  })

  it('refuses to finalize duplicate exact Unreleased headings', () => {
    const original = `# Changelog

## Unreleased

### Added

- Visible item.

## Unreleased

### Fixed

- Hidden item.
`
    const cwd = createFixture(original)

    const result = runFinalizer(cwd)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('exactly one ## Unreleased heading')
    expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toBe(original)
  })

  it.each([
    ['v1.1.0', '2026-07-20', 'version must use MAJOR.MINOR.PATCH'],
    ['1.1.0', '2026-02-30', 'date must be a real YYYY-MM-DD date'],
  ])('rejects invalid release arguments without changing the file', (version, date, message) => {
    const original = `# Changelog

## Unreleased

### Changed

- Improve release validation.
`
    const cwd = createFixture(original)

    const result = runFinalizer(cwd, version, date)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(message)
    expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toBe(original)
  })
})
