import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-system-'))
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

describe('CLI system commands', () => {
  it('fetches authenticated system diagnostics and update metadata', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })

      if (url === 'https://careers.example.com/api/updates/system' && init?.method === 'GET') {
        return Response.json({
          version: '1.0.0',
          database: { connected: true },
          storage: { connected: true },
        })
      }
      if (url === 'https://careers.example.com/api/updates/version' && init?.method === 'GET') {
        return Response.json({
          currentVersion: '1.0.0',
          latestVersion: '1.1.0',
          updateAvailable: true,
          releaseStatus: 'update-available',
        })
      }
      if (url === 'https://careers.example.com/api/updates/changelog' && init?.method === 'GET') {
        return Response.json({
          currentVersion: '1.0.0',
          entries: [{ title: 'v1.0.0', sections: [] }],
        })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const outputs: string[] = []

    for (const commandName of ['info', 'version', 'changelog']) {
      const exitCode = await runCli(
        ['system', commandName, '--config', configPath, '--json'],
        { stdout: value => outputs.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
      )
      expect(exitCode).toBe(0)
    }

    expect(outputs.map(value => JSON.parse(value))).toEqual([
      { version: '1.0.0', database: { connected: true }, storage: { connected: true } },
      { currentVersion: '1.0.0', latestVersion: '1.1.0', updateAvailable: true, releaseStatus: 'update-available' },
      { currentVersion: '1.0.0', entries: [{ title: 'v1.0.0', sections: [] }] },
    ])
  })
})
