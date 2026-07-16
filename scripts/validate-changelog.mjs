import { getChangelogItems, getReleaseNotes, getUnreleasedItems } from './changelog-format.mjs'

function hasNewItem(baseItems, currentItems) {
  const baseItemValues = new Set(baseItems)
  return currentItems.some(item => !baseItemValues.has(item))
}

function parseVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version)
  if (!match)
    throw new Error(`Version ${version} must use MAJOR.MINOR.PATCH without leading zeroes`)

  return match.slice(1).map(part => BigInt(part))
}

function isGreaterVersion(currentVersion, baseVersion) {
  const current = parseVersion(currentVersion)
  const base = parseVersion(baseVersion)

  for (let index = 0; index < current.length; index++) {
    if (current[index] > base[index])
      return true
    if (current[index] < base[index])
      return false
  }

  return false
}

function baseContainsReleaseSection(baseChangelog, version) {
  try {
    getReleaseNotes(baseChangelog, version)
    return true
  }
  catch (error) {
    const missingSection = `CHANGELOG.md must contain a matching Factory release section for v${version}`
    if (error instanceof Error && error.message === missingSection)
      return false

    throw error
  }
}

export function validateChangelogPolicy({
  changedFiles,
  baseChangelog,
  currentChangelog,
  baseVersion,
  currentVersion,
  skip,
}) {
  if (changedFiles.length === 0)
    return 'no-changes'

  const changelogChanged = changedFiles.includes('CHANGELOG.md') && baseChangelog !== currentChangelog

  if (baseVersion !== currentVersion) {
    if (!isGreaterVersion(currentVersion, baseVersion))
      throw new Error(`Release version ${currentVersion} must be greater than base version ${baseVersion}`)

    if (!changelogChanged)
      throw new Error('Release pull requests must update CHANGELOG.md')

    const releaseNotes = getReleaseNotes(currentChangelog, currentVersion)
    if (baseContainsReleaseSection(baseChangelog, currentVersion))
      throw new Error(`Release pull requests must newly introduce the Factory release section for v${currentVersion}`)

    const releaseItems = getChangelogItems(releaseNotes)
    if (releaseItems.length === 0)
      throw new Error(`The Factory release section for v${currentVersion} must contain at least one changelog item`)

    if (getUnreleasedItems(currentChangelog).length > 0)
      throw new Error('## Unreleased must be empty on a release pull request; run npm run changelog:finalize')

    const releaseItemValues = new Set(releaseItems)
    if (getUnreleasedItems(baseChangelog).some(item => !releaseItemValues.has(item)))
      throw new Error(`The Factory release section for v${currentVersion} must promote every base Unreleased item`)

    return 'release'
  }

  if (skip)
    return 'skipped'

  if (!changelogChanged)
    throw new Error('Add a new CHANGELOG.md item under ## Unreleased or apply the skip-changelog label')

  const baseItems = getUnreleasedItems(baseChangelog)
  const currentItems = getUnreleasedItems(currentChangelog)
  if (!hasNewItem(baseItems, currentItems))
    throw new Error('Add a new CHANGELOG.md item under ## Unreleased or apply the skip-changelog label')

  return 'pull-request'
}
