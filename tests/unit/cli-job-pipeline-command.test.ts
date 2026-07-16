import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('CLI jobs pipeline command', () => {
  it('forwards bounded pipeline filters to the authenticated job route', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-pipeline-'))
    tempDirs.push(dir)
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({
      activeProfile: 'prod',
      profiles: { prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' } },
    }))
    const fetchMock = vi.fn(async (rawUrl: string, init?: RequestInit) => {
      const url = new URL(rawUrl)
      expect(url.pathname).toBe('/api/jobs/job_1/pipeline')
      expect(Object.fromEntries(url.searchParams)).toEqual({
        page: '2',
        limit: '25',
        stage: 'interview',
        search: 'platform engineer',
        candidateSearch: 'Ada',
        score: 'medium',
        interviews: 'has-interview',
        sort: 'name-asc',
        propertyFilters: '[]',
      })
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({
        data: [], total: 0, page: 2, limit: 25,
        stageCounts: { new: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
      })
    })
    const stdout: string[] = []

    const exitCode = await runCli([
      'jobs', 'pipeline', 'job_1',
      '--page', '2', '--limit', '25', '--stage', 'interview',
      '--search', 'platform engineer', '--candidate-search', 'Ada',
      '--score', 'medium', '--interviews', 'has-interview', '--sort', 'name-asc',
      '--property-filters', '[]', '--config', configPath, '--json',
    ], {
      stdout: value => stdout.push(value),
      stderr: () => {},
      fetch: fetchMock as typeof fetch,
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0]!)).toMatchObject({ total: 0, page: 2, limit: 25 })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
