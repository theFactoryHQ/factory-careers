import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchLatestFactoryRelease, getAppVersion, requireAuth } = vi.hoisted(() => ({
  fetchLatestFactoryRelease: vi.fn(),
  getAppVersion: vi.fn(),
  requireAuth: vi.fn(),
}))

vi.mock('../../server/utils/factoryRelease', () => ({ fetchLatestFactoryRelease }))
vi.mock('../../server/utils/appVersion', () => ({
  getAppVersion,
  isNewerVersion: (current: string, latest: string) => current !== latest,
}))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requireAuth', requireAuth)

const versionRoute = (await import('../../server/api/updates/version.get')).default as (event: unknown) => Promise<Record<string, unknown>>

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('Factory Careers updates identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAppVersion.mockResolvedValue('1.0.0')
  })

  it('checks releases from the Factory-owned repository', () => {
    const releaseUtility = readProjectFile('server/utils/factoryRelease.ts')

    expect(releaseUtility).toContain("const owner = 'theFactoryHQ'")
    expect(releaseUtility).toContain("const repo = 'factory-careers'")
    expect(releaseUtility).toContain("'User-Agent': `Factory-Careers/${currentVersion}`")
    expect(releaseUtility).not.toContain("const owner = 'reqcore-inc'")
  })

  it.each([
    ['unpublished', 'unpublished'],
    ['unavailable', 'unavailable'],
  ] as const)('returns an explicit %s status without release metadata', async (lookupStatus, releaseStatus) => {
    fetchLatestFactoryRelease.mockResolvedValue({ status: lookupStatus })

    await expect(versionRoute({})).resolves.toEqual({
      currentVersion: '1.0.0',
      latestVersion: null,
      updateAvailable: false,
      releaseStatus,
      releaseUrl: null,
      releaseNotes: null,
      publishedAt: null,
    })
  })

  it.each([
    ['v1.0.0', 'current', false],
    ['v1.1.0', 'update-available', true],
  ] as const)('maps published release %s to %s', async (tagName, releaseStatus, updateAvailable) => {
    fetchLatestFactoryRelease.mockResolvedValue({
      status: 'published',
      release: {
        tag_name: tagName,
        html_url: `https://github.com/theFactoryHQ/factory-careers/releases/tag/${tagName}`,
        body: 'Release notes',
        published_at: '2026-07-16T12:00:00Z',
      },
    })

    await expect(versionRoute({})).resolves.toEqual({
      currentVersion: '1.0.0',
      latestVersion: tagName.replace(/^v/, ''),
      updateAvailable,
      releaseStatus,
      releaseUrl: `https://github.com/theFactoryHQ/factory-careers/releases/tag/${tagName}`,
      releaseNotes: 'Release notes',
      publishedAt: '2026-07-16T12:00:00Z',
    })
  })

  it('uses Factory-owned paths and release links in the updates page', () => {
    const updatesPage = readProjectFile('app/pages/dashboard/updates.vue')

    expect(updatesPage).toContain("description: 'Review Factory Careers releases and product changes'")
    expect(updatesPage).toContain('cd /path/to/factory-careers')
    expect(updatesPage).toContain('https://github.com/theFactoryHQ/factory-careers/releases')
    expect(updatesPage).not.toContain('/path/to/reqcore')
    expect(updatesPage).not.toContain('caffeinebounce/factory-careers/releases')
  })

  it('shows an unavailable state when GitHub returns no latest release', () => {
    const updatesPage = readProjectFile('app/pages/dashboard/updates.vue')

    expect(updatesPage).toContain('!versionInfo?.latestVersion && !versionLoading')
    expect(updatesPage).toContain('<template v-else-if="!versionInfo?.latestVersion">')
    expect(updatesPage).not.toContain('!versionInfo && !versionLoading')
    expect(updatesPage).not.toContain('<template v-else-if="!versionInfo">')
  })
})
