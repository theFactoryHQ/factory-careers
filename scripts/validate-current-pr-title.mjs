import { spawnSync } from 'node:child_process'
import { exit } from 'node:process'
import { fileURLToPath } from 'node:url'
import { validateConventionalTitle } from './validate-conventional-title.mjs'

export function getPrTitleValidationStatus(title, errorOutput = '', commandError = null) {
  const normalizedTitle = String(title ?? '').trim()
  const normalizedError = String(errorOutput ?? '').toLowerCase()

  if (!normalizedTitle && commandError?.code === 'ENOENT') {
    return {
      ok: true,
      skipped: true,
      message: 'GitHub CLI not found; skipping PR title validation.',
    }
  }

  if (!normalizedTitle && /no pull requests? found|failed to find pull request/.test(normalizedError)) {
    return {
      ok: true,
      skipped: true,
      message: 'No open pull request found for the current branch; skipping PR title validation.',
    }
  }

  if (!normalizedTitle) {
    return {
      ok: false,
      skipped: false,
      message: 'Unable to read the current pull request title.',
    }
  }

  const result = validateConventionalTitle(normalizedTitle)

  if (!result.ok) {
    return {
      ok: false,
      skipped: false,
      message: `Current PR title failed title lint: ${result.message}`,
    }
  }

  return {
    ok: true,
    skipped: false,
    message: 'Current PR title matches Conventional Commit format.',
  }
}

function readCurrentPrTitle() {
  return spawnSync('gh', ['pr', 'view', '--json', 'title', '--jq', '.title'], {
    encoding: 'utf8',
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const prTitle = readCurrentPrTitle()
  const status = getPrTitleValidationStatus(prTitle.stdout, prTitle.stderr, prTitle.error)

  if (status.skipped) {
    console.log(status.message)
    exit(0)
  }

  if (!status.ok) {
    console.error(status.message)
    exit(prTitle.status || 1)
  }

  console.log(status.message)
}
