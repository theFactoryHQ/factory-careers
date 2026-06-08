import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

let cachedVersion: string | null = null

/** Read the application version from package.json (cached after first read). */
export async function getAppVersion(): Promise<string> {
  if (cachedVersion) {
    return cachedVersion
  }

  const { version } = await readFile(
    resolve(process.cwd(), 'package.json'),
    'utf-8',
  ).then(JSON.parse) as { version: string }

  cachedVersion = version
  return version
}

/** Returns true when `latest` is a newer semver than `current` (x.y.z). */
export function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split('.').map(Number)
  const latestParts = latest.split('.').map(Number)

  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] ?? 0
    const l = latestParts[i] ?? 0
    if (l > c) return true
    if (l < c) return false
  }

  return false
}

/** Reset the cached version — intended for tests only. */
export function resetAppVersionCacheForTests(): void {
  cachedVersion = null
}