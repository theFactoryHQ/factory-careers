import { getAppVersion, isNewerVersion } from '../../utils/appVersion'
import { fetchLatestFactoryRelease } from '../../utils/factoryRelease'

/**
 * GET /api/updates/version
 *
 * Compares the running version (from package.json) against the latest
 * GitHub release to determine if an update is available.
 * Requires authentication.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const currentVersion = await getAppVersion()
  const lookup = await fetchLatestFactoryRelease(currentVersion)

  if (lookup.status !== 'published') {
    return {
      currentVersion,
      latestVersion: null as string | null,
      updateAvailable: false,
      releaseStatus: lookup.status,
      releaseUrl: null as string | null,
      releaseNotes: null as string | null,
      publishedAt: null as string | null,
    }
  }

  const latestVersion = lookup.release.tag_name.replace(/^v/, '')
  const updateAvailable = isNewerVersion(currentVersion, latestVersion)

  return {
    currentVersion,
    latestVersion,
    updateAvailable,
    releaseStatus: updateAvailable ? 'update-available' as const : 'current' as const,
    releaseUrl: lookup.release.html_url,
    releaseNotes: lookup.release.body,
    publishedAt: lookup.release.published_at,
  }
})
