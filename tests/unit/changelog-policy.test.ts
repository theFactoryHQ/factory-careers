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

  it('returns no-changes when the pull request has no changed files', () => {
    expect(validate({ changedFiles: [] })).toBe('no-changes')
  })
})
