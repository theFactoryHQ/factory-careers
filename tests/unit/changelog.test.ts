import { describe, expect, it } from 'vitest'
import { parseChangelog } from '../../server/utils/changelog'

describe('parseChangelog', () => {
  it('returns unreleased, versioned, and named Factory baseline entries', () => {
    const entries = parseChangelog(`# Changelog

## Unreleased

### Changed

- Use Factory-owned release sources.

## [1.5.0](https://github.com/theFactoryHQ/factory-careers/compare/v1.4.0...v1.5.0) (2026-07-20)

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
        title: 'v1.5.0',
        date: '2026-07-20',
        version: '1.5.0',
        link: 'https://github.com/theFactoryHQ/factory-careers/compare/v1.4.0...v1.5.0',
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
})
