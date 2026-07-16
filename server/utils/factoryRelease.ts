export interface FactoryGithubRelease {
  tag_name: string
  html_url: string
  body: string | null
  published_at: string
}

export type FactoryReleaseLookup =
  | { status: 'published'; release: FactoryGithubRelease }
  | { status: 'unpublished' | 'unavailable' }

function isFactoryGithubRelease(value: unknown): value is FactoryGithubRelease {
  if (!value || typeof value !== 'object')
    return false

  const release = value as Record<string, unknown>
  return typeof release.tag_name === 'string'
    && /^v?\d+\.\d+\.\d+$/.test(release.tag_name)
    && typeof release.html_url === 'string'
    && release.html_url.length > 0
    && (typeof release.body === 'string' || release.body === null)
    && typeof release.published_at === 'string'
    && release.published_at.length > 0
}

export async function fetchLatestFactoryRelease(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FactoryReleaseLookup> {
  const owner = 'theFactoryHQ'
  const repo = 'factory-careers'

  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': `Factory-Careers/${currentVersion}`,
        },
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (response.status === 404)
      return { status: 'unpublished' }

    if (!response.ok)
      return { status: 'unavailable' }

    const release: unknown = await response.json()
    if (!isFactoryGithubRelease(release))
      return { status: 'unavailable' }

    return { status: 'published', release }
  }
  catch {
    return { status: 'unavailable' }
  }
}
