import { getAppVersion, isNewerVersion } from '../../utils/appVersion'

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

  const owner = 'theFactoryHQ'
  const repo = 'factory-careers'

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': `Factory-Careers/${currentVersion}`,
        },
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (!response.ok) {
      return {
        currentVersion,
        latestVersion: null as string | null,
        updateAvailable: false,
        releaseUrl: null as string | null,
        releaseNotes: null as string | null,
        publishedAt: null as string | null,
      }
    }

    const release = await response.json() as {
      tag_name: string
      html_url: string
      body: string
      published_at: string
    }

    const latestVersion = release.tag_name.replace(/^v/, '')
    const updateAvailable = isNewerVersion(currentVersion, latestVersion)

    return {
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: release.html_url,
      releaseNotes: release.body,
      publishedAt: release.published_at,
    }
  }
  catch {
    return {
      currentVersion,
      latestVersion: null as string | null,
      updateAvailable: false,
      releaseUrl: null as string | null,
      releaseNotes: null as string | null,
      publishedAt: null as string | null,
    }
  }
})
