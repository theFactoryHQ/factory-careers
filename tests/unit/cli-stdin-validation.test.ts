import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-stdin-'))
  tempDirs.push(dir)
  return dir
}

function writeAuthedConfig(configPath: string) {
  writeFileSync(configPath, JSON.stringify({
    activeProfile: 'prod',
    profiles: {
      prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' },
    },
  }))
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('CLI stdin payload validation', () => {
  it('reports a specific missing stdin payload error for stdin-only create commands', async () => {
    const configPath = join(tempDir(), 'config.json')
    writeAuthedConfig(configPath)
    const stdout: string[] = []

    const exitCode = await runCli(
      ['jobs', 'create', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {} },
    )

    expect(exitCode).toBe(1)
    expect(JSON.parse(stdout[0])).toMatchObject({
      status: 400,
      code: 'MISSING_STDIN_PAYLOAD',
      message: 'Pass --stdin and pipe a JSON request body for this command.',
    })
  })
})
