import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseChangelog } from '../../server/utils/changelog'

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('parseChangelog', () => {
  it('returns unreleased, versioned, and named Factory baseline entries', () => {
    const entries = parseChangelog(`# Changelog

## Unreleased

### Changed

- Use Factory-owned release sources.

## [1.1.0](https://github.com/theFactoryHQ/factory-careers/compare/v1.0.0...v1.1.0) (2026-07-20)

### Added

- Add product release notes.

## 2026-07-16 — Factory Careers baseline

### Fixed

- Bundle the PDF parsing worker.
`)

    expect(entries).toEqual([
      {
        title: 'Unreleased',
        date: null,
        version: null,
        link: null,
        sections: [{ heading: 'Changed', items: ['Use Factory-owned release sources.'] }],
      },
      {
        title: 'v1.1.0',
        date: '2026-07-20',
        version: '1.1.0',
        link: 'https://github.com/theFactoryHQ/factory-careers/compare/v1.0.0...v1.1.0',
        sections: [{ heading: 'Added', items: ['Add product release notes.'] }],
      },
      {
        title: 'Factory Careers baseline',
        date: '2026-07-16',
        version: null,
        link: null,
        sections: [{ heading: 'Fixed', items: ['Bundle the PDF parsing worker.'] }],
      },
    ])
  })

  it('de-duplicates repeated title and date pairs while preserving source order', () => {
    const entries = parseChangelog(`## Unreleased

### Added

- First entry.

## Unreleased

### Fixed

- Duplicate entry.

## 2026-07-16

### Added

- Baseline entry.
`)

    expect(entries.map(entry => entry.title)).toEqual(['Unreleased', '2026-07-16'])
  })

  it('omits empty entries without hiding a later populated entry with the same identity', () => {
    const entries = parseChangelog(`## Unreleased

## Unreleased

### Changed

- Prepare the next Factory release.

## [1.0.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0) (2026-07-16)

### Added

- Establish the Factory release baseline.
`)

    expect(entries).toEqual([
      {
        title: 'Unreleased',
        date: null,
        version: null,
        link: null,
        sections: [{ heading: 'Changed', items: ['Prepare the next Factory release.'] }],
      },
      {
        title: 'v1.0.0',
        date: '2026-07-16',
        version: '1.0.0',
        link: 'https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0',
        sections: [{ heading: 'Added', items: ['Establish the Factory release baseline.'] }],
      },
    ])
  })

  it('starts the active changelog at the independent Factory v1.0.0 baseline', () => {
    const changelog = readProjectFile('CHANGELOG.md')
    const entries = parseChangelog(changelog)

    expect(changelog).toMatch(/## Unreleased\s+## \[1\.0\.0]\(https:\/\/github\.com\/theFactoryHQ\/factory-careers\/releases\/tag\/v1\.0\.0\) \(2026-07-16\)/)
    expect(changelog).toContain('first independent Factory Careers release')
    expect(changelog).toContain('[`docs/reference/REQCORE_CHANGELOG.md`](docs/reference/REQCORE_CHANGELOG.md)')
    expect(changelog).not.toContain('https://github.com/reqcore-inc/reqcore')
    expect(changelog).not.toContain('## [1.4.0]')
    expect(entries[0]).toMatchObject({ title: 'v1.0.0', version: '1.0.0', date: '2026-07-16' })
  })
})
