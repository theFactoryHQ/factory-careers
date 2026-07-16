import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getAppVersion } from '../../utils/appVersion'
import { parseChangelog } from '../../utils/changelog'

/**
 * GET /api/updates/changelog
 *
 * Parses CHANGELOG.md and returns structured changelog entries.
 * Requires authentication.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const changelogPath = resolve(process.cwd(), 'CHANGELOG.md')
  let raw: string
  try {
    raw = await readFile(changelogPath, 'utf-8')
  }
  catch {
    return { entries: [], currentVersion: null }
  }

  const currentVersion = await getAppVersion()
  return { entries: parseChangelog(raw), currentVersion }
})
