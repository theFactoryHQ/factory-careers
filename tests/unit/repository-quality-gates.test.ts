import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPrPreflightSteps } from '../../scripts/run-pr-validation-preflight.mjs'

const read = (path: string) => readFileSync(path, 'utf8')

describe('repository quality gates', () => {
  it('runs Nuxt-aware ESLint with a zero-warning budget in local and CI preflight', () => {
    const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
    const workflow = read('.github/workflows/pr-validation.yml')
    const eslintConfig = read('eslint.config.mjs')

    expect(packageJson.scripts.lint).toBe('eslint . --max-warnings=0')
    expect(eslintConfig).toContain("import withNuxt from './.nuxt/eslint.config.mjs'")
    expect(getPrPreflightSteps().map(step => step.name)).toContain('Lint')
    expect(workflow).toContain('run: npm run lint')
    expect(workflow).not.toContain('No lint script configured; skipping.')
  })

  it('keeps host development on 3001 and full Docker on 3000', () => {
    const setup = read('setup.sh')
    const compose = read('docker-compose.yml')
    const contributing = read('CONTRIBUTING.md')

    expect(setup).toContain('BETTER_AUTH_URL=http://localhost:3001')
    expect(setup).toContain('NUXT_PUBLIC_SITE_URL=http://localhost:3001')
    expect(compose).toContain('BETTER_AUTH_URL: http://localhost:3000')
    expect(compose).toContain('NUXT_PUBLIC_SITE_URL: http://localhost:3000')
    expect(contributing).toContain('http://localhost:3001')
    expect(contributing).toContain('http://localhost:3000')
  })
})
