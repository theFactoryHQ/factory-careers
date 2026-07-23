import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  join(process.cwd(), '.github/workflows/pr-validation.yml'),
  'utf8',
)

const auditStep = workflow.match(
  /      - name: Audit dependencies \(high severity\+\)\n([\s\S]*?)(?=\n      - name:|\n    [a-zA-Z])/,
)?.[0]

describe('dependency audit workflow policy', () => {
  it('runs only the production dependency audit at high severity', () => {
    const runDirectives = auditStep
      ?.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('run:'))

    expect(runDirectives).toEqual([
      'run: npm audit --omit=dev --audit-level=high',
    ])
  })

  it('does not suppress the dependency audit exit status', () => {
    expect(auditStep).toBeDefined()
    expect(auditStep).not.toMatch(/\|\||\|\s*tee\b|;\s*exit\s+0\b/)
  })

  it('does not allow the dependency audit step to continue on error', () => {
    expect(auditStep).toBeDefined()
    expect(auditStep).not.toMatch(/continue-on-error:\s*true/)
  })
})
