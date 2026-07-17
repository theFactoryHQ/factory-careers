#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { chmod, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getStrictChangelogItems, getUnreleasedSection, hasReleaseVersionClaim } from './changelog-format.mjs'

function assertVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new Error('version must use MAJOR.MINOR.PATCH without a leading v')
}

function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error('date must be a real YYYY-MM-DD date')

  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date)
    throw new Error('date must be a real YYYY-MM-DD date')
}

export function finalizeChangelog(raw, version, date) {
  assertVersion(version)
  assertDate(date)

  if (hasReleaseVersionClaim(raw, version))
    throw new Error(`CHANGELOG.md already contains v${version}`)

  const {
    normalized,
    headingStart,
    bodyEnd,
    body: unreleasedBody,
  } = getUnreleasedSection(raw)

  if (getStrictChangelogItems(unreleasedBody, 'Unreleased').length === 0)
    throw new Error('Unreleased must contain at least one changelog item under Added, Changed, Fixed, or Removed')

  const before = normalized.slice(0, headingStart)
  const after = normalized.slice(bodyEnd)
  const releaseHeading = `## [${version}](https://github.com/theFactoryHQ/factory-careers/releases/tag/v${version}) (${date})`
  const finalized = `${before}## Unreleased\n\n${releaseHeading}\n\n${unreleasedBody}\n\n${after}`

  return finalized.endsWith('\n') ? finalized : `${finalized}\n`
}

async function writeAtomically(filePath, contents) {
  const temporaryPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  )
  const { mode } = await stat(filePath)

  try {
    await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx', mode })
    await chmod(temporaryPath, mode)
    await rename(temporaryPath, filePath)
  }
  finally {
    await rm(temporaryPath, { force: true })
  }
}

export async function main(args = process.argv.slice(2)) {
  const [version, date, ...extra] = args
  if (!version || !date || extra.length > 0)
    throw new Error('usage: npm run changelog:finalize -- <version> <YYYY-MM-DD>')

  const changelogPath = join(process.cwd(), 'CHANGELOG.md')
  const raw = await readFile(changelogPath, 'utf8')
  const finalized = finalizeChangelog(raw, version, date)
  await writeAtomically(changelogPath, finalized)
  process.stdout.write(`Finalized CHANGELOG.md for v${version}.\n`)
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`changelog:finalize: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
