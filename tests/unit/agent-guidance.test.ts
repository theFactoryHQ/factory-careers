import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('agent guidance', () => {
  it('keeps AGENTS.md and CLAUDE.md identical with Factory Careers context', () => {
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true)
    expect(existsSync(join(root, 'CLAUDE.md'))).toBe(true)

    const agents = read('AGENTS.md')

    expect(read('CLAUDE.md')).toBe(agents)
    expect(agents).not.toContain('/Users/')
    expect(agents).not.toContain('douglasebanks')

    for (const snippet of [
      'Factory Careers',
      'Nuxt 4',
      'Authenticated CLI',
      'organizationId',
      'analysisContext',
      'Do not hardcode org-specific business context',
      'Search for an existing component, composable, helper, or server utility before creating a new one',
      'Treat structural duplication as implementation work',
      'gh --repo theFactoryHQ/factory-careers',
      'npm run preflight:pr',
      'docs/reference/THEME.md',
      'Browser QA matters',
      '## Changelog Maintenance',
      'Update `CHANGELOG.md` in the same change',
      '**Added**',
      '**Changed**',
      '**Fixed**',
      '**Removed**',
      'npm run changelog:finalize -- <version> <YYYY-MM-DD>',
    ]) {
      expect(agents, `AGENTS.md missing ${snippet}`).toContain(snippet)
    }
  })

  it('provides a fast convention check for agent-facing repo rules', () => {
    const packageJson = JSON.parse(read('package.json'))

    expect(packageJson.scripts['check:conventions']).toBe('bash scripts/check-conventions.sh')
    expect(read('.githooks/pre-commit')).toContain('AGENTS.md and CLAUDE.md must stay in sync')
    expect(read('scripts/check-conventions.sh')).toContain('Checking agent docs sync')
    expect(read('scripts/check-conventions.sh')).toContain('npm run preflight:cli-parity')
  })

  it('documents the enforced changelog workflow for agents', () => {
    const agents = read('AGENTS.md')
    const claude = read('CLAUDE.md')
    const releaseBodyRule = 'The exact curated changelog section for that version becomes the GitHub Release body'

    expect(claude).toBe(agents)
    expect(agents).toContain('Every ordinary user- or operator-visible pull request must preserve every distinct Unreleased item')
    expect(agents).toContain("from the pull request's merge base and add a genuinely new item")
    expect(agents).toContain('Do not remove, reword, or replace existing Unreleased items')
    expect(agents).toContain('The maintainer-applied exact `skip-changelog` label is only for genuinely internal changes')
    expect(agents).toContain('CHANGELOG_SKIP=true npm run preflight:pr')
    expect(agents).toContain('Release or version-changing pull requests cannot use this exception')
    expect(agents).toContain('must first rebase onto the current base branch')
    expect(agents).toContain('npm run changelog:finalize -- <version> <YYYY-MM-DD>')
    expect(agents).toContain('matching version section must be nonempty')
    expect(agents).toContain('`## Unreleased` must contain no entries')
    expect(agents).toContain('`skip-changelog: true` only to avoid overwriting curated notes')
    expect(agents).toContain(releaseBodyRule)
    expect(claude).toContain(releaseBodyRule)
  })

  it('points contributors to agent guidance and convention checks', () => {
    const contributing = read('CONTRIBUTING.md')

    expect(contributing).toContain('[AGENTS.md](AGENTS.md)')
    expect(contributing).toContain('npm run check:conventions')
    expect(contributing).toContain('Agent-generated commits should use `git commit --no-verify`')
  })
})
