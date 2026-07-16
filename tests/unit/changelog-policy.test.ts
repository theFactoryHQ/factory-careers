import { describe, expect, it } from 'vitest'
import { getReleaseNotes, getUnreleasedItems } from '../../scripts/changelog-format.mjs'
import { validateChangelogPolicy } from '../../scripts/validate-changelog.mjs'

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
