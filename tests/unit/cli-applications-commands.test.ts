import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('CLI application commands', () => {
  it('passes application filters and content search to the list API', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-applications-'))
    tempDirs.push(dir)
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({
      activeProfile: 'prod',
      profiles: {
        prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' },
      },
    }))
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/applications?page=2&limit=25&jobId=job_1&candidateId=candidate_1&status=screening&search=quantum+upholstery')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({ data: [{ id: 'app_1' }], total: 1, page: 2, limit: 25 })
    })
    const stdout: string[] = []

    const exitCode = await runCli([
      'applications',
      'list',
      '--page',
      '2',
      '--limit',
      '25',
      '--job-id',
      'job_1',
      '--candidate-id',
      'candidate_1',
      '--status',
      'screening',
      '--search',
      'quantum upholstery',
      '--config',
      configPath,
      '--json',
    ], {
      stdout: value => stdout.push(value),
      stderr: () => {},
      fetch: fetchMock as typeof fetch,
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ data: [{ id: 'app_1' }], total: 1, page: 2, limit: 25 })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
