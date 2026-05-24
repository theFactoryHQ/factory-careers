import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-capabilities-'))
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
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('CLI capabilities command', () => {
  it('fetches server capabilities with the bearer token', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/cli/capabilities')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({
        contractVersion: '1.0.0',
        minimumCliVersion: '1.0.0',
        currentCliSupported: true,
        resourceGroups: ['jobs'],
      })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['system', 'capabilities', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toMatchObject({
      contractVersion: '1.0.0',
      minimumCliVersion: '1.0.0',
      currentCliSupported: true,
    })
  })
})
