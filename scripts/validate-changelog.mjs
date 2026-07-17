import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getReleaseNotes, getStrictChangelogItems, getUnreleasedItems } from './changelog-format.mjs'
import { resolveBaseRef } from './git-base-ref.mjs'

const changelogFile = 'CHANGELOG.md'
const packageFile = 'package.json'

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

    const releaseItems = getStrictChangelogItems(releaseNotes, `Release v${currentVersion}`)
    if (releaseItems.length === 0)
      throw new Error(`The Factory release section for v${currentVersion} must contain at least one changelog item`)

    if (getUnreleasedItems(currentChangelog).length > 0)
      throw new Error('## Unreleased must be empty on a release pull request; run npm run changelog:finalize')

    const releaseItemValues = new Set(releaseItems)
    if (getUnreleasedItems(baseChangelog).some(item => !releaseItemValues.has(item)))
      throw new Error(`The Factory release section for v${currentVersion} must promote every base Unreleased item`)

    return 'release'
  }

  if (!changelogChanged) {
    if (skip)
      return 'skipped'

    throw new Error('Add a new CHANGELOG.md item under ## Unreleased or apply the skip-changelog label')
  }

  const baseItems = getUnreleasedItems(baseChangelog)
  const currentItems = getUnreleasedItems(currentChangelog)
  const currentItemValues = new Set(currentItems)
  if ([...new Set(baseItems)].some(item => !currentItemValues.has(item))) {
    throw new Error(
      'Preserve every existing distinct CHANGELOG.md item under ## Unreleased; do not remove, reword, or replace existing items',
    )
  }

  if (skip)
    return 'skipped'

  if (!hasNewItem(baseItems, currentItems))
    throw new Error('Add a new CHANGELOG.md item under ## Unreleased or apply the skip-changelog label')

  return 'pull-request'
}

function runGit(args, message) {
  const result = spawnSync('git', args, { encoding: 'utf8' })

  if (result.error)
    throw new Error(`${message}: ${result.error.message}`)

  if (result.status !== 0) {
    const detail = result.stderr.trim()
    throw new Error(detail ? `${message}: ${detail}` : message)
  }

  return result.stdout
}

function resolveCommit(ref, requestedRef) {
  const commit = runGit(
    ['rev-parse', '--verify', `${ref}^{commit}`],
    `Unable to resolve ${requestedRef} to a commit`,
  ).trim()

  if (!commit)
    throw new Error(`Unable to resolve ${requestedRef} to a commit`)

  return commit
}

function resolveMergeBase(baseCommit, headCommit, requestedBaseRef, requestedHeadRef) {
  const mergeBase = runGit(
    ['merge-base', baseCommit, headCommit],
    `Unable to find a merge base between ${requestedHeadRef} and ${requestedBaseRef}`,
  ).trim()

  if (!mergeBase)
    throw new Error(`Unable to find a merge base between ${requestedHeadRef} and ${requestedBaseRef}`)

  return mergeBase
}

function readBaseFile(baseRef, file) {
  return runGit(
    ['show', `${baseRef}:${file}`],
    `Unable to read ${file} from base ref ${baseRef}`,
  )
}

function readPackageVersion(raw, source) {
  let parsed

  try {
    parsed = JSON.parse(raw)
  }
  catch (error) {
    throw new Error(`Unable to parse ${source}: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (typeof parsed.version !== 'string')
    throw new Error(`${source} must contain a string version field`)

  return parsed.version
}

async function readCurrentFile(file) {
  try {
    return await readFile(join(process.cwd(), file), 'utf8')
  }
  catch (error) {
    throw new Error(`Unable to read current ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function main(env = process.env) {
  const requestedBaseRef = env.PR_PREFLIGHT_BASE_REF || 'origin/main'
  const requestedHeadRef = env.PR_PREFLIGHT_HEAD_REF || 'HEAD'
  const remote = env.PR_PREFLIGHT_REMOTE || 'origin'
  const baseRef = resolveBaseRef(requestedBaseRef, remote)
  const baseTip = resolveCommit(baseRef, requestedBaseRef)
  const headCommit = resolveCommit(requestedHeadRef, requestedHeadRef)
  const mergeBase = resolveMergeBase(baseTip, headCommit, requestedBaseRef, requestedHeadRef)

  const changedFiles = runGit(
    ['diff', '--name-only', `${baseTip}...${headCommit}`],
    `Unable to compute changed files against ${requestedBaseRef}`,
  ).split('\n').filter(Boolean)

  const currentChangelog = await readCurrentFile(changelogFile)
  const baseChangelog = readBaseFile(mergeBase, changelogFile)
  const basePackage = readBaseFile(mergeBase, packageFile)
  const headPackage = readBaseFile(headCommit, packageFile)
  const baseVersion = readPackageVersion(basePackage, `${mergeBase}:${packageFile}`)
  const headVersion = readPackageVersion(headPackage, `${headCommit}:${packageFile}`)

  if (baseVersion !== headVersion && mergeBase !== baseTip) {
    throw new Error(
      `Release pull requests must rebase onto the current ${requestedBaseRef} before changelog finalization`,
    )
  }

  const mode = validateChangelogPolicy({
    changedFiles,
    baseChangelog,
    currentChangelog,
    baseVersion,
    currentVersion: headVersion,
    skip: env.CHANGELOG_SKIP === 'true',
  })

  process.stdout.write(`Changelog policy passed (${mode}).\n`)
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`changelog:check: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
