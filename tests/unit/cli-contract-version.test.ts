import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('CLI API compatibility contract', () => {
  it('defines shared server and CLI contract metadata', async () => {
    const contract = await import('../../shared/cli-contract')
    const cliPackage = JSON.parse(read('packages/careers-cli/package.json')) as { version: string }

    expect(contract.CLI_API_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(contract.MINIMUM_SUPPORTED_CLI_VERSION).toBe(cliPackage.version)
    expect(contract.CLI_CAPABILITIES_ROUTE).toBe('/api/cli/capabilities')
  })

  it('exposes an authenticated capabilities endpoint covered by CLI route manifest', () => {
    expect(existsSync(join(root, 'server/api/cli/capabilities.get.ts'))).toBe(true)

    const route = read('server/api/cli/capabilities.get.ts')
    const manifest = read('packages/careers-cli/src/routeCoverage.ts')

    expect(route).toContain('requireAuth(event)')
    expect(route).toContain('CLI_API_CONTRACT_VERSION')
    expect(route).toContain('MINIMUM_SUPPORTED_CLI_VERSION')
    expect(manifest).toContain("server/api/cli/capabilities.get.ts")
    expect(manifest).toContain("command: 'system capabilities'")
  })

  it('documents compatibility versioning for maintainers and users', () => {
    const docs = read('docs/CLI.md')

    expect(docs).toContain('Compatibility Contract')
    expect(docs).toContain('CLI_API_CONTRACT_VERSION')
    expect(docs).toContain('MINIMUM_SUPPORTED_CLI_VERSION')
    expect(docs).toContain('factory-careers system capabilities --json')
  })
})
