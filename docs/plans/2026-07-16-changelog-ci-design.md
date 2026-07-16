# Changelog CI enforcement design

## Goal

Make the curated Factory Careers changelog a release contract rather than a
documentation convention. User- and operator-visible pull requests must record
their outcome under `## Unreleased`, and every published release must use the
matching versioned changelog section as its GitHub Release notes.

## Policy

For an ordinary pull request, CI compares the branch with its base ref. The
check requires `CHANGELOG.md` to change and requires at least one new bullet
under `Added`, `Changed`, `Fixed`, or `Removed` in `## Unreleased`. A maintainer
can apply the `skip-changelog` label when a change is genuinely internal. Local
preflight supports the equivalent `CHANGELOG_SKIP=true` environment variable.

A pull request that changes the root package version is a release pull request.
The skip mechanism does not apply to it. Its changelog must contain a matching
Factory release heading with at least one supported-category item, and
`## Unreleased` must be empty after finalization. This detects a release-please
PR that has not yet run `npm run changelog:finalize`.

## Components and data flow

`scripts/changelog-format.mjs` owns changelog parsing and extraction so the
finalizer, validator, and release publisher use one grammar. The parser only
recognizes the four curated categories and Factory-owned release headings.

`scripts/validate-changelog.mjs` obtains the PR diff against
`PR_PREFLIGHT_BASE_REF`, reads the base and current package versions and
changelogs, and applies the policy. It runs as an explicit PR Validation step
and as the first local `preflight:pr` step.

`scripts/extract-release-notes.mjs` writes the requested version section body to
stdout. The Release workflow uses it after release-please creates a release and
then replaces the GitHub Release body. Release Verification repeats the same
operation for every published release, so manually published releases receive
the same treatment. If the published tag has no valid matching section, the
release is marked as a prerelease and is not advertised as Latest.

## Error handling and verification

Failures explain the exact remedy: add an `Unreleased` item, apply the narrowly
scoped skip label, or finalize the release changelog. Version releases cannot
silently bypass the policy. The Release workflow fails when
`RELEASE_PLEASE_TOKEN` is absent instead of reporting success while doing no
release work.

Pure parser and policy tests cover ordinary PR success and failure, the skip
path, release finalization, empty release sections, and note extraction.
Repository-contract tests cover workflow wiring, local preflight, documentation,
and the retained `skip-changelog: true` release-please configuration.
