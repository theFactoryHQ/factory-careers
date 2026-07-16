# Factory Careers versioning

Factory Careers uses semantic versioning for its independent Factory release
lineage.

## Factory v1.0.0 cutover

v1.0.0 is the cutover from inherited Reqcore package metadata to Factory's own
release identity. The app and CLI remain synchronized on the same version until
they are deliberately decoupled through a documented release-process change.

## Release rules

### Patch releases

Patch releases contain compatible fixes. They may correct defects, security
issues, documentation, or operational behavior without changing a supported
API, CLI, configuration, or data contract incompatibly.

### Minor releases

Minor releases contain compatible product, API, or CLI additions. Existing
supported integrations and automation should continue to work without required
changes.

### Major releases

Major releases contain incompatible API, CLI, configuration, or data-contract
changes. Migration guidance must accompany any such change.

## Pull-request changelog gate

Every ordinary user- or operator-visible pull request must add a genuinely new item
under `## Unreleased` in one supported category: **Added**, **Changed**, **Fixed**,
or **Removed**. Rewording an existing item does not satisfy the gate.

The maintainer-applied exact `skip-changelog` label is only for genuinely internal changes.
Use the same exception locally with `CHANGELOG_SKIP=true npm run preflight:pr`,
and record the justification in the pull request.

Release and version-changing pull requests cannot use the exception. In the
release PR, promote the reviewed Unreleased entries with the intended semantic
version and UTC publication date:

```bash
npm run changelog:finalize -- <version> <YYYY-MM-DD>
```

Commit the resulting `CHANGELOG.md`. The matching version section must be nonempty,
and `## Unreleased` must contain no entries. The finalizer rejects empty release
notes, invalid version or date arguments, and duplicate version headings. It
writes the completed changelog atomically and restores an empty Unreleased
structure for the next development cycle.

## Release automation

v1.0.0 has already been published. Automated release-please publishing is not
active until its repository secret is configured: `RELEASE_PLEASE_TOKEN` remains required,
and issue #27 remains the current prerequisite. Until then, the Release workflow
fails clearly instead of silently skipping automation.

Factory Careers deliberately keeps `CHANGELOG.md` curated. Release-please retains
`skip-changelog: true` only to avoid overwriting curated notes; it still determines
the next version and keeps the app, CLI, lockfile, and release manifest synchronized.

After a finalized release PR merges, publication is atomic:

1. Release-please creates a draft GitHub Release with forced tag creation.
2. The workflow extracts only the matching curated version section without npm
   lifecycle noise:

   ```bash
   npm run --silent changelog:extract -- "<version>" > release-notes.md
   ```

   It installs that exact curated version body and then publishes the release as
   the latest release.
3. Release Verification validates the published body before smoke-testing the
   released image. It demotes a failed release to a pre-release and removes its
   latest designation; successful verification attaches the self-hoster bundle.

## Legacy Reqcore identifiers

Legacy Reqcore persisted identifiers are compatibility concerns, not Factory
version identity. Database values, API fields, configuration keys, and other
persisted identifiers should not be blindly renamed: evaluate their consumers
and provide migrations or compatibility handling when a rename is necessary.
