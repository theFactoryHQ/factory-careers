import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('Factory Careers updates identity', () => {
  it('checks releases from the Factory-owned repository', () => {
    const versionRoute = readProjectFile('server/api/updates/version.get.ts')

    expect(versionRoute).toContain("const owner = 'theFactoryHQ'")
    expect(versionRoute).toContain("const repo = 'factory-careers'")
    expect(versionRoute).toContain("'User-Agent': `Factory-Careers/${currentVersion}`")
    expect(versionRoute).not.toContain("const owner = 'reqcore-inc'")
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
