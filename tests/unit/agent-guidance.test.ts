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

  it('points contributors to agent guidance and convention checks', () => {
    const contributing = read('CONTRIBUTING.md')

    expect(contributing).toContain('[AGENTS.md](AGENTS.md)')
    expect(contributing).toContain('npm run check:conventions')
    expect(contributing).toContain('Agent-generated commits should use `git commit --no-verify`')
  })
})
