import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCliTestHarness } from '../helpers/cli-test-harness'

describe('CLI test harness', () => {
  it('exposes a reusable authenticated CLI runner', async () => {
    const harness = createCliTestHarness('factory-careers-cli-harness-')

    harness.fetchMock.mockResolvedValue(Response.json({ data: [] }))

    const exitCode = await harness.run(['jobs', 'list', '--json'])

    expect(exitCode).toBe(0)
    expect(harness.fetchMock).toHaveBeenCalled()
    expect(JSON.parse(harness.stdout[0])).toEqual({ data: [] })
  })

  it('writes an authenticated config profile for automation commands', () => {
    const source = readFileSync(join(process.cwd(), 'tests/helpers/cli-test-harness.ts'), 'utf8')

    expect(source).toContain('writeAuthedConfig')
    expect(source).toContain('createCliTestHarness')
    expect(source).toContain('secret-token')
  })

  it('is adopted by representative CLI command test files', () => {
    const migratedTests = [
      'tests/unit/cli-jobs-commands.test.ts',
      'tests/unit/cli-candidates-applications-commands.test.ts',
      'tests/unit/cli-org-commands.test.ts',
    ]

    for (const file of migratedTests) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(source, file).toContain('../helpers/cli-test-harness')
    }

    for (const file of migratedTests.filter(path => path !== 'tests/unit/cli-org-commands.test.ts')) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(source, file).not.toContain('function writeAuthedConfig(')
    }
  })
})