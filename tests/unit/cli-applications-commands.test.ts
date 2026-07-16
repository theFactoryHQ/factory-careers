import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

afterEach(() => {
  vi.useRealTimers()
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

  it('bounds a hung initial missing-analysis request with the command timeout', async () => {
    vi.useFakeTimers()
    const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-applications-'))
    tempDirs.push(dir)
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({
      activeProfile: 'prod',
      profiles: { prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' } },
    }))
    let requestSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    })
    const stdout: string[] = []

    const running = runCli(
      ['applications', 'analyze-missing', '--yes', '--timeout', '1', '--config', configPath, '--json'],
      { stdout: value => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const result = expect(running).resolves.toBe(1)

    await vi.advanceTimersByTimeAsync(1_000)
    await result

    expect(requestSignal?.aborted).toBe(true)
    expect(stdout).toHaveLength(1)
    expect(JSON.parse(stdout[0]!)).toMatchObject({ code: 'PROCESSING_TIMEOUT' })
  })

  it('queues organization-wide missing-only analysis without enumerating applications', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-applications-'))
    tempDirs.push(dir)
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({
      activeProfile: 'prod',
      profiles: { prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' } },
    }))
    const terminal = {
      batchId: 'batch_missing',
      type: 'application_analysis',
      status: 'completed',
      counts: { pending: 0, processing: 0, succeeded: 0, failed: 0, cancelled: 0, attempted: 0, total: 0 },
      errorsByCode: {},
      createdAt: '2026-07-16T12:00:00.000Z',
      startedAt: null,
      completedAt: '2026-07-16T12:00:00.000Z',
      retryAfterMs: null,
    }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/applications/analyze-missing')
      expect(init?.method).toBe('POST')
      return Response.json(terminal, { status: 202 })
    })
    const stdout: string[] = []

    const exit = await runCli(
      ['applications', 'analyze-missing', '--yes', '--config', configPath, '--json'],
      { stdout: value => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exit).toBe(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(stdout[0]!)).toEqual(terminal)
  })

  it('returns a resumable missing-only batch immediately with --no-wait', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-applications-'))
    tempDirs.push(dir)
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({
      activeProfile: 'prod',
      profiles: { prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' } },
    }))
    const pending = {
      batchId: 'batch_pending',
      type: 'application_analysis',
      status: 'pending',
      counts: { pending: 3, processing: 0, succeeded: 0, failed: 0, cancelled: 0, attempted: 0, total: 3 },
      errorsByCode: {},
      createdAt: '2026-07-16T12:00:00.000Z',
      startedAt: null,
      completedAt: null,
      retryAfterMs: 1_000,
    }
    const fetchMock = vi.fn(async () => Response.json(pending, { status: 202 }))
    const stdout: string[] = []

    const exit = await runCli(
      ['applications', 'analyze-missing', '--yes', '--no-wait', '--config', configPath, '--json'],
      { stdout: value => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exit).toBe(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(stdout[0]!)).toEqual(pending)
  })
})
