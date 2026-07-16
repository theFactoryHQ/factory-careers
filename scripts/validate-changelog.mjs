import { getReleaseNotes, getUnreleasedItems, hasChangelogItem } from './changelog-format.mjs'

function hasNewItem(baseItems, currentItems) {
  const remainingBaseItems = new Map()

  for (const item of baseItems)
    remainingBaseItems.set(item, (remainingBaseItems.get(item) ?? 0) + 1)

  for (const item of currentItems) {
    const remaining = remainingBaseItems.get(item) ?? 0
    if (remaining === 0)
      return true

    remainingBaseItems.set(item, remaining - 1)
  }

  return false
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
    if (!changelogChanged)
      throw new Error('Release pull requests must update CHANGELOG.md')

    const releaseNotes = getReleaseNotes(currentChangelog, currentVersion)
    if (!hasChangelogItem(releaseNotes))
      throw new Error(`The Factory release section for v${currentVersion} must contain at least one changelog item`)

    if (getUnreleasedItems(currentChangelog).length > 0)
      throw new Error('## Unreleased must be empty on a release pull request; run npm run changelog:finalize')

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
