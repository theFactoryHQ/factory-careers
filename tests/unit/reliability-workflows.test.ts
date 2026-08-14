import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getPrPreflightSteps } from '../../scripts/run-pr-validation-preflight.mjs'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('reliability workflow contracts', () => {
  it('runs migration discipline in the local pull-request preflight', () => {
    expect(getPrPreflightSteps().map(step => step.name)).toContain('Migration discipline')
  })

  it('runs migration discipline and upgrade rehearsal in pull-request validation', () => {
    const workflow = read('.github/workflows/pr-validation.yml')
    expect(workflow).toContain('npm run check:migration-discipline')
    expect(workflow).toContain('npm run test:integration:migrations')
    expect(workflow).toContain('MIGRATION_UPGRADE_PG_REQUIRED: "true"')
  })

  it('gates production deployment for the exact pushed main commit', () => {
    const workflow = read('.github/workflows/production-deploy-gate.yml')
    expect(workflow).toContain('name: Production deploy gate')
    expect(workflow).toContain('branches: [main]')
    expect(workflow).toContain('github.event.before')
    expect(workflow).toContain('npm run check:migration-discipline')
    expect(workflow).toContain('npm run test:integration:migrations')
    expect(workflow).toContain('npm run test:integration:application-notifications')
    expect(workflow).toContain('npm run ops:validate-production-env')
    expect(workflow).toContain('npm run build')
  })
})
