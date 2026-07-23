import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  join(process.cwd(), '.github/workflows/pr-validation.yml'),
  'utf8',
)
const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  overrides?: Record<string, unknown>
}

const auditStep = workflow.match(
  /      - name: Audit dependencies \(high severity\+\)\n([\s\S]*?)(?=\n      - name:|\n    [a-zA-Z])/,
)?.[0]

describe('dependency audit workflow policy', () => {
  it('runs only the full dependency audit at high severity', () => {
    const auditCommands = workflow
      .match(/\bnpm audit[^\n]*/g)
      ?.map(command => command.trim())

    expect(auditCommands).toEqual(['npm audit --audit-level=high'])
  })

  it('does not suppress the dependency audit exit status', () => {
    expect(auditStep).toBeDefined()
    expect(auditStep).not.toMatch(/\|\||\|\s*tee\b|;\s*exit\s+0\b/)
  })

  it('does not allow the dependency audit step to continue on error', () => {
    expect(auditStep).toBeDefined()
    expect(auditStep).not.toMatch(/continue-on-error:\s*true/)
  })

  it('does not declare the unused wait-on dependency', () => {
    expect(packageJson.dependencies).not.toHaveProperty('wait-on')
    expect(packageJson.devDependencies).not.toHaveProperty('wait-on')
  })

  it('does not retain an orphaned Axios override', () => {
    expect(packageJson.overrides).not.toHaveProperty('axios')
  })
})
