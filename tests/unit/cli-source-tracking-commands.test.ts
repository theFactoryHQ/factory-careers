import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../cli/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-source-tracking-'))
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

describe('CLI source tracking commands', () => {
  it('lists tracking links with filters', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/tracking-links?page=2&limit=10&jobId=job_1&channel=linkedin&isActive=true')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({ data: [{ id: 'link_1', channel: 'linkedin' }], total: 1, page: 2, limit: 10 })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      [
        'source-tracking',
        'list',
        '--page',
        '2',
        '--limit',
        '10',
        '--job-id',
        'job_1',
        '--channel',
        'linkedin',
        '--active',
        'true',
        '--config',
        configPath,
        '--json',
      ],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ data: [{ id: 'link_1', channel: 'linkedin' }], total: 1, page: 2, limit: 10 })
  })

  it('creates a tracking link from stdin JSON', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/tracking-links')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        jobId: 'job_1',
        name: 'LinkedIn launch',
        channel: 'linkedin',
      })
      return Response.json({ id: 'link_1', code: 'abc123', channel: 'linkedin' }, { status: 201 })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['source-tracking', 'create', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({
          jobId: 'job_1',
          name: 'LinkedIn launch',
          channel: 'linkedin',
        }),
      },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'link_1', code: 'abc123', channel: 'linkedin' })
  })

  it('updates and deletes tracking links', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/tracking-links/link_1' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ isActive: false })
        return Response.json({ id: 'link_1', isActive: false })
      }
      if (url === 'https://careers.example.com/api/tracking-links/link_1' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const updateOut: string[] = []
    const deleteOut: string[] = []

    const updateExit = await runCli(
      ['source-tracking', 'update', 'link_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => updateOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ isActive: false }),
      },
    )
    const deleteExit = await runCli(
      ['source-tracking', 'delete', 'link_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => deleteOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(updateExit).toBe(0)
    expect(deleteExit).toBe(0)
    expect(JSON.parse(updateOut[0])).toEqual({ id: 'link_1', isActive: false })
    expect(JSON.parse(deleteOut[0])).toEqual({ deleted: true, id: 'link_1' })
  })

  it('fetches tracking link stats and source stats', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/tracking-links/link_1/stats?from=2026-05-01T00%3A00%3A00.000Z&to=2026-05-24T00%3A00%3A00.000Z') {
        expect(init?.method).toBe('GET')
        return Response.json({ link: { id: 'link_1', cvr: 25 }, funnel: {} })
      }
      if (url === 'https://careers.example.com/api/source-tracking/stats?jobId=job_1') {
        expect(init?.method).toBe('GET')
        return Response.json({ channelBreakdown: [], summary: { attributionRate: 80 } })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const linkStatsOut: string[] = []
    const sourceStatsOut: string[] = []

    const linkStatsExit = await runCli(
      [
        'source-tracking',
        'link-stats',
        'link_1',
        '--from',
        '2026-05-01T00:00:00.000Z',
        '--to',
        '2026-05-24T00:00:00.000Z',
        '--config',
        configPath,
        '--json',
      ],
      { stdout: (value) => linkStatsOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const sourceStatsExit = await runCli(
      ['source-tracking', 'stats', '--job-id', 'job_1', '--config', configPath, '--json'],
      { stdout: (value) => sourceStatsOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(linkStatsExit).toBe(0)
    expect(sourceStatsExit).toBe(0)
    expect(JSON.parse(linkStatsOut[0])).toEqual({ link: { id: 'link_1', cvr: 25 }, funnel: {} })
    expect(JSON.parse(sourceStatsOut[0])).toEqual({ channelBreakdown: [], summary: { attributionRate: 80 } })
  })
})
