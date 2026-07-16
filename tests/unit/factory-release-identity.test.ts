import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FACTORY_VERSION = '1.0.0'

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function readProjectJson<T>(path: string): T {
  return JSON.parse(readProjectFile(path)) as T
}

interface PackageMetadata {
  version: string
}

interface PackageLock {
  version: string
  packages: Record<string, { version?: string }>
}

interface ReleasePleaseConfig {
  packages: {
    '.': {
      'skip-changelog': boolean
      'extra-files': Array<Record<string, string>>
    }
  }
}

describe('Factory Careers release identity', () => {
  it('keeps active app and CLI metadata at the Factory v1.0.0 cutover', () => {
    const rootPackage = readProjectJson<PackageMetadata>('package.json')
    const cliPackage = readProjectJson<PackageMetadata>('packages/careers-cli/package.json')
    const packageLock = readProjectJson<PackageLock>('package-lock.json')
    const releaseManifest = readProjectJson<Record<string, string>>('.release-please-manifest.json')

    expect({
      rootPackage: rootPackage.version,
      cliPackage: cliPackage.version,
      lockfile: packageLock.version,
      rootLockfilePackage: packageLock.packages['']?.version,
      cliLockfilePackage: packageLock.packages['packages/careers-cli']?.version,
      releaseManifest: releaseManifest['.'],
    }).toEqual({
      rootPackage: FACTORY_VERSION,
      cliPackage: FACTORY_VERSION,
      lockfile: FACTORY_VERSION,
      rootLockfilePackage: FACTORY_VERSION,
      cliLockfilePackage: FACTORY_VERSION,
      releaseManifest: FACTORY_VERSION,
    })
  })

  it('keeps CLI package and lockfile metadata synchronized through release-please', () => {
    const releaseConfig = readProjectJson<ReleasePleaseConfig>('.github/release-please-config.json')

    expect(releaseConfig.packages['.']['skip-changelog']).toBe(true)
    expect(releaseConfig.packages['.']['extra-files']).toEqual([
      {
        type: 'json',
        path: 'packages/careers-cli/package.json',
        jsonpath: '$.version',
      },
      {
        type: 'json',
        path: 'package-lock.json',
        jsonpath: '$.packages["packages/careers-cli"].version',
      },
    ])
  })

  it('documents the Factory release policy and preserves the changelog entry point', () => {
    const changelog = readProjectFile('CHANGELOG.md')
    const readme = readProjectFile('README.md')
    const versioningGuide = readProjectFile('docs/reference/VERSIONING.md')
    const packageJson = readProjectJson<{ scripts: Record<string, string> }>('package.json')
    const agents = readProjectFile('AGENTS.md')
    const pullRequestTemplate = readProjectFile('.github/pull_request_template.md')

    expect(changelog).toContain('## Unreleased')
    expect(changelog).toContain('[`docs/reference/REQCORE_CHANGELOG.md`](docs/reference/REQCORE_CHANGELOG.md)')
    expect(changelog).not.toContain('https://github.com/reqcore-inc/reqcore')
    expect(readme).toContain('[`docs/reference/VERSIONING.md`](docs/reference/VERSIONING.md)')
    expect(versioningGuide).toContain('v1.0.0')
    expect(versioningGuide).toMatch(/patch[\s\S]*compatible fixes/i)
    expect(versioningGuide).toMatch(/minor[\s\S]*compatible (?:product|API|CLI)[\s\S]*additions/i)
    expect(versioningGuide).toMatch(/major[\s\S]*incompatible[\s\S]*(?:API|CLI|configuration|data-contract)/i)
    expect(versioningGuide).toMatch(/app and CLI[\s\S]*synchronized[\s\S]*deliberately decoupled/i)
    expect(versioningGuide).toContain('RELEASE_PLEASE_TOKEN')
    expect(versioningGuide).toContain('#27')
    expect(versioningGuide).toMatch(/first v1\.0\.0 release[\s\S]*manually/i)
    expect(versioningGuide).toMatch(/legacy Reqcore persisted identifiers[\s\S]*compatibility concerns/i)
    expect(versioningGuide).toMatch(/should not be blindly renamed/i)
    expect(versioningGuide).toContain('skip-changelog')
    expect(versioningGuide).toContain('npm run changelog:finalize -- <version> <YYYY-MM-DD>')
    expect(versioningGuide).toMatch(/release PR[\s\S]*changelog:finalize/i)
    expect(packageJson.scripts['changelog:finalize']).toBe('node scripts/finalize-changelog.mjs')
    expect(agents).toContain('npm run changelog:finalize -- <version> <YYYY-MM-DD>')
    expect(pullRequestTemplate).toContain('npm run changelog:finalize -- <version> <YYYY-MM-DD>')
    expect(pullRequestTemplate).not.toContain('release-please uses to generate the changelog')
  })
})
