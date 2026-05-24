import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-public-'))
  tempDirs.push(dir)
  return dir
}

function writeConfig(configPath: string) {
  writeFileSync(configPath, JSON.stringify({
    activeProfile: 'prod',
    profiles: {
      prod: { baseUrl: 'https://careers.example.com' },
    },
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('CLI public commands', () => {
  it('lists and gets public jobs without an auth token', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/public/jobs?page=2&limit=10&search=engineer&type=full_time&location=remote') {
        expect(init?.method).toBe('GET')
        expect(init?.headers).not.toHaveProperty('Authorization')
        return Response.json({ data: [{ slug: 'senior-engineer' }], total: 1, page: 2, limit: 10 })
      }
      if (url === 'https://careers.example.com/api/public/jobs/senior-engineer') {
        expect(init?.method).toBe('GET')
        expect(init?.headers).not.toHaveProperty('Authorization')
        return Response.json({ slug: 'senior-engineer', title: 'Senior Engineer', questions: [] })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const listOut: string[] = []
    const getOut: string[] = []

    const listExit = await runCli(
      ['public', 'jobs', 'list', '--page', '2', '--limit', '10', '--search', 'engineer', '--type', 'full_time', '--location', 'remote', '--config', configPath, '--json'],
      { stdout: (value) => listOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const getExit = await runCli(
      ['public', 'jobs', 'get', 'senior-engineer', '--config', configPath, '--json'],
      { stdout: (value) => getOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(listExit).toBe(0)
    expect(getExit).toBe(0)
    expect(JSON.parse(listOut[0])).toEqual({ data: [{ slug: 'senior-engineer' }], total: 1, page: 2, limit: 10 })
    expect(JSON.parse(getOut[0])).toEqual({ slug: 'senior-engineer', title: 'Senior Engineer', questions: [] })
  })

  it('submits public applications from stdin JSON', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/public/jobs/senior-engineer/apply')
      expect(init?.method).toBe('POST')
      expect(init?.headers).not.toHaveProperty('Authorization')
      expect(JSON.parse(String(init?.body))).toEqual({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        responses: [],
      })
      return Response.json({ success: true, applicationId: 'app_1' }, { status: 201 })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['public', 'jobs', 'apply', 'senior-engineer', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          responses: [],
        }),
      },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ success: true, applicationId: 'app_1' })
  })
})
