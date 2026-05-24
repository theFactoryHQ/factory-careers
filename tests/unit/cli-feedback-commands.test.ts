import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-feedback-'))
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

describe('CLI feedback commands', () => {
  it('shows authenticated feedback integration status', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/feedback/config')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({ enabled: true })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['feedback', 'status', '--config', configPath, '--json'],
      { stdout: value => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ enabled: true })
  })

  it('submits authenticated feedback from stdin JSON', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const payload = {
      type: 'feature',
      title: 'Add more CLI workflows',
      description: 'Agents need deterministic terminal access to all workflows.',
      includeReporterContext: true,
      includeEmail: false,
      featureContext: {
        userProblem: 'Agents cannot report missing automation workflows.',
      },
    }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/feedback')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      expect(JSON.parse(String(init?.body))).toEqual(payload)
      return Response.json({ issueUrl: 'https://github.com/theFactoryHQ/factory-careers/issues/123' }, { status: 201 })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['feedback', 'submit', '--stdin', '--config', configPath, '--json'],
      {
        stdout: value => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify(payload),
      },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({
      issueUrl: 'https://github.com/theFactoryHQ/factory-careers/issues/123',
    })
  })
})
