import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-jobs-'))
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

describe('CLI jobs commands', () => {
  it('lists jobs with the active bearer token', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/jobs')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({ data: [{ id: 'job_1', title: 'Engineer' }] })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['jobs', 'list', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ data: [{ id: 'job_1', title: 'Engineer' }] })
  })

  it('gets a job by ID', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/jobs/job_1')
      expect(init?.method).toBe('GET')
      return Response.json({ id: 'job_1', title: 'Engineer' })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['jobs', 'get', 'job_1', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'job_1', title: 'Engineer' })
  })

  it('creates a job from stdin JSON when --yes is provided', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/jobs')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ title: 'Engineer', status: 'draft' })
      return Response.json({ id: 'job_1', title: 'Engineer', status: 'draft' })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['jobs', 'create', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ title: 'Engineer', status: 'draft' }),
      },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'job_1', title: 'Engineer', status: 'draft' })
  })

  it('treats stdin JSON as automation confirmation for mutating commands', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/jobs')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ title: 'Engineer', status: 'draft' })
      return Response.json({ id: 'job_1', title: 'Engineer', status: 'draft' })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['jobs', 'create', '--stdin', '--no-input', '--config', configPath, '--json'],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ title: 'Engineer', status: 'draft' }),
      },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'job_1', title: 'Engineer', status: 'draft' })
  })

  it('refuses mutating job commands without --yes in no-input mode', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const stdout: string[] = []

    const exitCode = await runCli(
      ['jobs', 'delete', 'job_1', '--no-input', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {} },
    )

    expect(exitCode).toBe(1)
    expect(JSON.parse(stdout[0])).toEqual({
      status: 400,
      code: 'CONFIRMATION_REQUIRED',
      message: 'Pass --yes to confirm this mutating command.',
    })
  })

  it.each([
    ['open', 'open'],
    ['close', 'closed'],
    ['archive', 'archived'],
  ])('%s updates a job lifecycle status with confirmation', async (commandName, status) => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/jobs/job_1')
      expect(init?.method).toBe('PATCH')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      expect(JSON.parse(String(init?.body))).toEqual({ status })
      return Response.json({ id: 'job_1', title: 'Engineer', status })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['jobs', commandName, 'job_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'job_1', title: 'Engineer', status })
  })
})
