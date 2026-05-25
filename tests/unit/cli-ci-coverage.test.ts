import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('CLI CI coverage', () => {
  it('keeps PR validation wired to tests, typecheck, build, and CLI executable smoke checks', () => {
    const workflow = read('.github/workflows/pr-validation.yml')

    expect(workflow).toContain('npm run test:unit')
    expect(workflow).toContain('npm run typecheck')
    expect(workflow).toContain('npm run build')
    expect(workflow).toContain('Check CLI parity evidence')
    expect(workflow).toContain('npm run preflight:cli-parity')
    expect(workflow).toContain('Run CLI smoke tests')
    expect(workflow).toContain('./packages/careers-cli/bin/factory-careers.mjs --help')
    expect(workflow).toContain('./packages/careers-cli/bin/factory-careers.mjs auth status --json')
    expect(workflow).toContain('./packages/careers-cli/bin/factory-careers.mjs jobs --help')
    expect(workflow).toContain('./packages/careers-cli/bin/factory-careers.mjs feedback --help')
    expect(workflow).toContain('./packages/careers-cli/bin/factory-careers.mjs system --help')
  })
})
