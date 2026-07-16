import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-dashboard-'))
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

describe('CLI dashboard commands', () => {
  it('fetches dashboard summary stats with the bearer token used by the cached API route', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/dashboard/stats')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({ counts: { openJobs: 3 }, pipeline: {}, jobsByStatus: {} })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['dashboard', 'summary', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ counts: { openJobs: 3 }, pipeline: {}, jobsByStatus: {} })
  })

  it('fetches activity log and timeline data with filters', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/activity-log?page=2&limit=25&resourceType=job&resourceId=job_1') {
        expect(init?.method).toBe('GET')
        return Response.json({ data: [{ id: 'act_1' }], total: 1, page: 2, limit: 25 })
      }
      if (url === 'https://careers.example.com/api/activity-log/timeline?limit=20&resourceType=application&after=2026-05-01T00%3A00%3A00.000Z') {
        expect(init?.method).toBe('GET')
        return Response.json({ items: [{ id: 'act_2' }], upcoming: [], hasMore: false })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const activityOut: string[] = []
    const timelineOut: string[] = []

    const activityExit = await runCli(
      [
        'dashboard',
        'activity',
        '--page',
        '2',
        '--limit',
        '25',
        '--resource-type',
        'job',
        '--resource-id',
        'job_1',
        '--config',
        configPath,
        '--json',
      ],
      { stdout: (value) => activityOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const timelineExit = await runCli(
      [
        'dashboard',
        'timeline',
        '--limit',
        '20',
        '--resource-type',
        'application',
        '--after',
        '2026-05-01T00:00:00.000Z',
        '--config',
        configPath,
        '--json',
      ],
      { stdout: (value) => timelineOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(activityExit).toBe(0)
    expect(timelineExit).toBe(0)
    expect(JSON.parse(activityOut[0])).toEqual({ data: [{ id: 'act_1' }], total: 1, page: 2, limit: 25 })
    expect(JSON.parse(timelineOut[0])).toEqual({ items: [{ id: 'act_2' }], upcoming: [], hasMore: false })
  })

  it('fetches candidate timeline and AI analysis stats', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/activity-log/candidate-timeline?candidateId=cand_1&limit=30') {
        expect(init?.method).toBe('GET')
        return Response.json({ items: [], candidateId: 'cand_1', candidateName: 'Ada Lovelace' })
      }
      if (url === 'https://careers.example.com/api/ai-analysis/stats') {
        expect(init?.method).toBe('GET')
        return Response.json({
          usagePeriod: { startDate: '2026-06-17', endDate: '2026-07-16' },
          summary: { totalRuns: 4 },
          dailyRuns: [],
        })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const candidateOut: string[] = []
    const aiOut: string[] = []

    const candidateExit = await runCli(
      ['dashboard', 'candidate-timeline', 'cand_1', '--limit', '30', '--config', configPath, '--json'],
      { stdout: (value) => candidateOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const aiExit = await runCli(
      ['dashboard', 'ai-stats', '--config', configPath, '--json'],
      { stdout: (value) => aiOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(candidateExit).toBe(0)
    expect(aiExit).toBe(0)
    expect(JSON.parse(candidateOut[0])).toEqual({ items: [], candidateId: 'cand_1', candidateName: 'Ada Lovelace' })
    expect(JSON.parse(aiOut[0])).toEqual({
      usagePeriod: { startDate: '2026-06-17', endDate: '2026-07-16' },
      summary: { totalRuns: 4 },
      dailyRuns: [],
    })
  })
})
