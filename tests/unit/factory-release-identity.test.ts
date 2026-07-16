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
      'draft': boolean
      'force-tag-creation': boolean
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

  it('fails release automation clearly when RELEASE_PLEASE_TOKEN is missing', () => {
    const releaseWorkflow = readProjectFile('.github/workflows/release-please.yml')
    const missingTokenStep = `      - name: Release automation token required
        if: \${{ env.HAS_RELEASE_PLEASE_TOKEN != 'true' }}
        run: |
          echo "Release Please cannot run because RELEASE_PLEASE_TOKEN is not configured."
          echo "Tracking issue: https://github.com/theFactoryHQ/factory-careers/issues/27"
          {
            echo "## Release Please blocked"
            echo ""
            echo "The workflow needs RELEASE_PLEASE_TOKEN before it can create or update release PRs."
            echo ""
            echo "Tracking issue: https://github.com/theFactoryHQ/factory-careers/issues/27"
          } >> "$GITHUB_STEP_SUMMARY"
          exit 1`

    expect(releaseWorkflow).toContain(missingTokenStep)
    expect(releaseWorkflow).not.toContain('Release Please is skipped')
    expect(releaseWorkflow).not.toContain('## Release Please skipped')
  })

  it('publishes a draft release atomically only after curated notes are ready', () => {
    const releaseConfig = readProjectJson<ReleasePleaseConfig>('.github/release-please-config.json')
    const releaseWorkflow = readProjectFile('.github/workflows/release-please.yml')
    const releaseAction = `      - uses: googleapis/release-please-action@v5
        id: release
        if: \${{ env.HAS_RELEASE_PLEASE_TOKEN == 'true' }}`
    const checkoutStep = `      - name: Checkout draft release
        if: \${{ steps.release.outputs.release_created == 'true' }}
        uses: actions/checkout@v6
        with:
          ref: \${{ steps.release.outputs.tag_name }}
          persist-credentials: false`
    const setupNodeStep = `      - name: Setup Node.js
        if: \${{ steps.release.outputs.release_created == 'true' }}
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc`
    const extractStep = `      - name: Extract curated release notes
        if: \${{ steps.release.outputs.release_created == 'true' }}
        run: npm run --silent changelog:extract -- "\${{ steps.release.outputs.version }}" > release-notes.md`
    const publishStep = `      - name: Publish curated release notes
        if: \${{ steps.release.outputs.release_created == 'true' }}
        env:
          GH_TOKEN: \${{ secrets.RELEASE_PLEASE_TOKEN }}
        run: |
          gh release edit "\${{ steps.release.outputs.tag_name }}" \\
            --notes-file release-notes.md \\
            --draft=false \\
            --latest`

    expect(releaseConfig.packages['.'].draft).toBe(true)
    expect(releaseConfig.packages['.']['force-tag-creation']).toBe(true)
    expect(releaseConfig.packages['.']['skip-changelog']).toBe(true)
    expect(releaseWorkflow).toContain(releaseAction)
    expect(releaseWorkflow).toContain(checkoutStep)
    expect(releaseWorkflow).toContain(setupNodeStep)
    expect(releaseWorkflow).toContain(extractStep)
    expect(releaseWorkflow).toContain(publishStep)
    expect(releaseWorkflow.match(/gh release edit/g)).toHaveLength(1)
    expect(releaseWorkflow.indexOf(releaseAction)).toBeLessThan(releaseWorkflow.indexOf(checkoutStep))
    expect(releaseWorkflow.indexOf(checkoutStep)).toBeLessThan(releaseWorkflow.indexOf(setupNodeStep))
    expect(releaseWorkflow.indexOf(setupNodeStep)).toBeLessThan(releaseWorkflow.indexOf(extractStep))
    expect(releaseWorkflow.indexOf(extractStep)).toBeLessThan(releaseWorkflow.indexOf(publishStep))
  })

  it('resolves one strictly validated tag for every release verification job', () => {
    const releaseVerification = readProjectFile('.github/workflows/release-verification.yml')
    const resolveTagJobStart = releaseVerification.indexOf('  resolve-tag:')
    const releaseNotesJobStart = releaseVerification.indexOf('  release-notes:')
    const smokeTestJobStart = releaseVerification.indexOf('  smoke-test:')
    const bundleJobStart = releaseVerification.indexOf('  bundle:')
    const resolveTagJob = releaseVerification.slice(resolveTagJobStart, releaseNotesJobStart)

    expect(resolveTagJobStart).toBeGreaterThan(-1)
    expect(resolveTagJobStart).toBeLessThan(releaseNotesJobStart)
    expect(resolveTagJob).toContain(`    outputs:
      tag: \${{ steps.tag.outputs.tag }}
      version: \${{ steps.tag.outputs.version }}`)
    expect(resolveTagJob).toContain(`      - name: Resolve release tag
        id: tag
        env:
          RELEASE_EVENT_TAG: \${{ github.event.release.tag_name }}
          DISPATCH_TAG: \${{ inputs.tag }}
        run: |
          set -euo pipefail
          tag="\${RELEASE_EVENT_TAG:-$DISPATCH_TAG}"
          if [[ ! "$tag" =~ ^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$ ]]; then
            echo "Invalid release tag: $tag" >&2
            exit 1
          fi
          version="\${tag#v}"
          echo "tag=$tag" >> "$GITHUB_OUTPUT"
          echo "version=$version" >> "$GITHUB_OUTPUT"`)
    expect(releaseVerification.match(/- name: Resolve release tag/g)).toHaveLength(1)
    expect(releaseVerification).not.toContain('tag="${{ github.event.release.tag_name || inputs.tag }}"')
    expect(releaseVerification.slice(releaseNotesJobStart, smokeTestJobStart)).toContain('needs: resolve-tag')
    expect(releaseVerification.slice(smokeTestJobStart, bundleJobStart)).toContain('needs: [resolve-tag, release-notes]')
    expect(releaseVerification.slice(bundleJobStart)).toContain('needs: [resolve-tag, smoke-test]')
  })

  it('demotes a release event by validated release ID when tag resolution fails', () => {
    const releaseVerification = readProjectFile('.github/workflows/release-verification.yml')
    const resolveTagJobStart = releaseVerification.indexOf('  resolve-tag:')
    const releaseNotesJobStart = releaseVerification.indexOf('  release-notes:')
    const resolveTagJob = releaseVerification.slice(resolveTagJobStart, releaseNotesJobStart)
    const cleanupStepStart = resolveTagJob.indexOf('      - name: Demote event release when tag validation fails')
    const cleanupStep = resolveTagJob.slice(cleanupStepStart)

    expect(cleanupStepStart).toBeGreaterThan(-1)
    expect(cleanupStep).toContain(`      - name: Demote event release when tag validation fails
        if: failure() && github.event_name == 'release'
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GH_REPO: \${{ github.repository }}
          RELEASE_ID: \${{ github.event.release.id }}
        run: |
          set -euo pipefail
          if [[ ! "$RELEASE_ID" =~ ^[1-9][0-9]*$ ]]; then
            echo "Invalid release ID: $RELEASE_ID" >&2
            exit 1
          fi
          gh api \\
            --method PATCH \\
            "repos/{owner}/{repo}/releases/\${RELEASE_ID}" \\
            -F prerelease=true \\
            -f make_latest=false`)
    expect(cleanupStep).not.toContain('continue-on-error: true')
    expect(cleanupStep).not.toContain('RELEASE_EVENT_TAG')
    expect(cleanupStep).not.toContain('DISPATCH_TAG')
    expect(cleanupStep).not.toContain('$tag')
  })

  it('validates published curated notes before smoke tests and demotes every failed verification', () => {
    const releaseVerification = readProjectFile('.github/workflows/release-verification.yml')
    const releaseNotesJobStart = releaseVerification.indexOf('  release-notes:')
    const smokeTestJobStart = releaseVerification.indexOf('  smoke-test:')
    const bundleJobStart = releaseVerification.indexOf('  bundle:')
    const releaseNotesJob = releaseVerification.slice(releaseNotesJobStart, smokeTestJobStart)
    const smokeTestJob = releaseVerification.slice(smokeTestJobStart, bundleJobStart)

    expect(releaseNotesJobStart).toBeGreaterThan(-1)
    expect(releaseNotesJobStart).toBeLessThan(smokeTestJobStart)
    expect(releaseNotesJob).toContain(`      - name: Checkout release tag
        uses: actions/checkout@v6
        with:
          ref: \${{ needs.resolve-tag.outputs.tag }}
          persist-credentials: false`)
    expect(releaseNotesJob).toContain(`      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc`)
    expect(releaseNotesJob).toContain(
      'run: npm run --silent changelog:extract -- "${{ needs.resolve-tag.outputs.version }}" > release-notes.md',
    )
    expect(releaseNotesJob).toContain(
      'run: gh release view "$RELEASE_TAG" --json body --jq .body > published-release-notes.md',
    )
    expect(releaseNotesJob).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}')
    expect(releaseNotesJob).toContain("replace(/\\r\\n/g, '\\n').trimEnd()")
    expect(releaseNotesJob).toContain("readFileSync('release-notes.md', 'utf8')")
    expect(releaseNotesJob).toContain("readFileSync('published-release-notes.md', 'utf8')")
    expect(releaseNotesJob).not.toContain('--notes-file')
    expect(releaseNotesJob).toContain('if: failure()')
    expect(releaseNotesJob).toContain('gh release edit "$RELEASE_TAG" --prerelease --latest=false')
    expect(smokeTestJob).toContain('if: failure()')
    expect(smokeTestJob).toContain('gh release edit "$RELEASE_TAG" --prerelease --latest=false')
    expect(releaseNotesJob).not.toContain("if: failure() && github.event_name == 'release'")
    expect(smokeTestJob).not.toContain("if: failure() && github.event_name == 'release'")
    expect(releaseVerification.match(/persist-credentials: false/g)).toHaveLength(3)
    expect(releaseNotesJob).not.toContain('continue-on-error: true')
  })

  it('uses the Factory cutover version in release verification examples', () => {
    const releaseVerification = readProjectFile('.github/workflows/release-verification.yml')

    expect(releaseVerification).toContain('v1.0.0')
    expect(releaseVerification).not.toContain('v1.4.0')
  })

  it('uses a clean Factory lineage in the changelog parser fixture', () => {
    const changelogTest = readProjectFile('tests/unit/changelog.test.ts')

    expect(changelogTest).toContain('/compare/v1.0.0...v1.1.0')
    expect(changelogTest).not.toContain('/compare/v1.4.0...v1.5.0')
  })

  it('targets the Factory repository in the release-please dry run task', () => {
    const vscodeTasks = readProjectFile('.vscode/tasks.json')

    expect(vscodeTasks).toContain('--repo-url=https://github.com/theFactoryHQ/factory-careers')
    expect(vscodeTasks).not.toContain('--repo-url=https://github.com/reqcore-inc/reqcore')
  })

  it('enforces changelog policy before broad pull-request validation', () => {
    const workflow = readProjectFile('.github/workflows/pr-validation.yml')
    const pullRequestTypes = workflow.match(/pull_request:\n    types: \[([^\]]+)]/)?.[1].split(',').map(type => type.trim())
    const changelogStep = `      - name: Changelog policy
        id: changelog
        run: npm run changelog:check
        env:
          PR_PREFLIGHT_BASE_REF: origin/\${{ github.base_ref || 'main' }}
          CHANGELOG_SKIP: \${{ github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'skip-changelog') }}`

    expect(pullRequestTypes).toEqual(expect.arrayContaining(['labeled', 'unlabeled']))
    expect(workflow).toContain(changelogStep)
    expect(workflow.indexOf('- name: Setup Node.js')).toBeLessThan(workflow.indexOf('- name: Changelog policy'))
    expect(workflow.indexOf('- name: Changelog policy')).toBeLessThan(workflow.indexOf('- name: Install dependencies'))
    expect(workflow).toContain("CHANGELOG_SKIP: ${{ github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'skip-changelog') }}")
    expect(workflow).toContain("| Changelog policy | $(status_icon '${{ steps.changelog.outcome }}') ${{ steps.changelog.outcome }} |")
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
    expect(versioningGuide).toContain('v1.0.0 has already been published')
    expect(versioningGuide).not.toMatch(/first v1\.0\.0 release[\s\S]*manually/i)
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

  it('documents the enforced pull-request and release workflow', () => {
    const versioningGuide = readProjectFile('docs/reference/VERSIONING.md')
    const pullRequestTemplate = readProjectFile('.github/pull_request_template.md')

    expect(versioningGuide).toContain('Every ordinary user- or operator-visible pull request must add a genuinely new item')
    expect(versioningGuide).toContain('under `## Unreleased`')
    expect(versioningGuide).toMatch(/\*\*Added\*\*[\s\S]*\*\*Changed\*\*[\s\S]*\*\*Fixed\*\*[\s\S]*\*\*Removed\*\*/)
    expect(versioningGuide).toContain('maintainer-applied exact `skip-changelog` label')
    expect(versioningGuide).toContain('only for genuinely internal changes')
    expect(versioningGuide).toContain('CHANGELOG_SKIP=true npm run preflight:pr')
    expect(versioningGuide).toContain('Release and version-changing pull requests cannot use the exception')
    expect(versioningGuide).toContain('npm run changelog:finalize -- <version> <YYYY-MM-DD>')
    expect(versioningGuide).toContain('matching version section must be nonempty')
    expect(versioningGuide).toContain('`## Unreleased` must contain no entries')
    expect(versioningGuide).toContain('`skip-changelog: true` only to avoid overwriting curated notes')
    expect(versioningGuide).toContain('draft GitHub Release with forced tag creation')
    expect(versioningGuide).toContain('npm run --silent changelog:extract -- "<version>" > release-notes.md')
    expect(versioningGuide).toContain('installs that exact curated version body and then publishes the release')
    expect(versioningGuide).toMatch(/Release Verification[\s\S]*validates[\s\S]*demotes/i)
    expect(versioningGuide).toContain('`RELEASE_PLEASE_TOKEN` remains required')
    expect(versioningGuide).toContain('issue #27 remains the current prerequisite')
    expect(versioningGuide).not.toMatch(/first v1\.0\.0 release[\s\S]*future|first v1\.0\.0 release[\s\S]*manually/i)

    expect(pullRequestTemplate).toContain('- [ ] Changelog updated:')
    expect(pullRequestTemplate).toContain('- [ ] Skip justified:')
    expect(pullRequestTemplate).toContain('exact `skip-changelog` label')
    expect(pullRequestTemplate).toContain('- [ ] Release PR finalized:')
    expect(pullRequestTemplate).toContain('npm run changelog:finalize -- <version> <YYYY-MM-DD>')
    expect(pullRequestTemplate).toContain('- [ ] Risks recorded:')
  })
})
