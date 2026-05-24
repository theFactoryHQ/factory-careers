import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../cli/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-core-'))
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

describe('CLI candidate and application commands', () => {
  it('creates a candidate from stdin JSON', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/candidates')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      expect(JSON.parse(String(init?.body))).toEqual({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      })
      return Response.json({ id: 'cand_1', email: 'ada@example.com' })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['candidates', 'create', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
        }),
      },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'cand_1', email: 'ada@example.com' })
  })

  it('updates a candidate custom property value', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/candidates/cand_1/properties/prop_1')
      expect(init?.method).toBe('PUT')
      expect(JSON.parse(String(init?.body))).toEqual({ value: 'NYC' })
      return Response.json({ id: 'value_1', value: 'NYC' })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['candidates', 'set-property', 'cand_1', 'prop_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ value: 'NYC' }),
      },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'value_1', value: 'NYC' })
  })

  it('creates an application from stdin JSON', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/applications')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        candidateId: 'cand_1',
        jobId: 'job_1',
      })
      return Response.json({ id: 'app_1', candidateId: 'cand_1', jobId: 'job_1', status: 'new' })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['applications', 'create', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ candidateId: 'cand_1', jobId: 'job_1' }),
      },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'app_1', candidateId: 'cand_1', jobId: 'job_1', status: 'new' })
  })

  it('updates an application pipeline status with an explicit command', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/applications/app_1')
      expect(init?.method).toBe('PATCH')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      expect(JSON.parse(String(init?.body))).toEqual({ status: 'interviewing' })
      return Response.json({ id: 'app_1', status: 'interviewing' })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['applications', 'status', 'app_1', 'interviewing', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'app_1', status: 'interviewing' })
  })

  it('runs application analysis and fetches scores', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/applications/app_1/analyze') {
        expect(init?.method).toBe('POST')
        return Response.json({ status: 'completed', compositeScore: 88 })
      }
      if (url === 'https://careers.example.com/api/applications/app_1/scores') {
        expect(init?.method).toBe('GET')
        return Response.json({ compositeScore: 88, criteria: [] })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const analyzeOut: string[] = []
    const scoresOut: string[] = []

    const analyzeExit = await runCli(
      ['applications', 'analyze', 'app_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => analyzeOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const scoresExit = await runCli(
      ['applications', 'scores', 'app_1', '--config', configPath, '--json'],
      { stdout: (value) => scoresOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(analyzeExit).toBe(0)
    expect(scoresExit).toBe(0)
    expect(JSON.parse(analyzeOut[0])).toEqual({ status: 'completed', compositeScore: 88 })
    expect(JSON.parse(scoresOut[0])).toEqual({ compositeScore: 88, criteria: [] })
  })
})
