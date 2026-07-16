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

## First release and automation

The first v1.0.0 release will be created manually after the metadata cutover is
merged. Automated release-please publishing requires the
`RELEASE_PLEASE_TOKEN` repository secret; that prerequisite is tracked by issue
#27. After the prerequisite is complete, release-please will keep the app, CLI,
lockfile, and release manifest synchronized.

Factory Careers deliberately keeps `CHANGELOG.md` curated. The release-please
package uses `skip-changelog: true`: it still determines the next version and
GitHub release notes, but it does not generate or duplicate changelog entries.

For every later release PR, confirm that `## Unreleased` contains the reviewed
user- and operator-facing entries, then promote them with the release version
and UTC publication date:

```bash
npm run changelog:finalize -- <version> <YYYY-MM-DD>
```

Commit the resulting `CHANGELOG.md` to the release PR. The finalizer rejects an
empty Unreleased section, invalid version or date arguments, and duplicate
version headings. It writes the completed changelog atomically and restores an
empty `## Unreleased` entry for the next development cycle.

## Legacy Reqcore identifiers

Legacy Reqcore persisted identifiers are compatibility concerns, not Factory
version identity. Database values, API fields, configuration keys, and other
persisted identifiers should not be blindly renamed: evaluate their consumers
and provide migrations or compatibility handling when a rename is necessary.
