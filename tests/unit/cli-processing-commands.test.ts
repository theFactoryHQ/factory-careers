import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function authedConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-processing-cli-'))
  tempDirs.push(dir)
  const path = join(dir, 'config.json')
  writeFileSync(path, JSON.stringify({
    activeProfile: 'prod',
    profiles: { prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' } },
  }))
  return path
}

function batch(status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled') {
  const terminal = ['completed', 'failed', 'cancelled'].includes(status)
  return {
    batchId: 'batch_1',
    type: 'application_analysis',
    status,
    counts: {
      pending: terminal ? 0 : 1,
      processing: 0,
      succeeded: status === 'completed' ? 1 : 0,
      failed: status === 'failed' ? 1 : 0,
      cancelled: status === 'cancelled' ? 1 : 0,
      attempted: terminal ? 1 : 0,
      total: 1,
    },
    errorsByCode: status === 'failed' ? { provider_unavailable: 1 } : {},
    createdAt: '2026-07-16T12:00:00.000Z',
    startedAt: terminal ? '2026-07-16T12:00:01.000Z' : null,
    completedAt: terminal ? '2026-07-16T12:00:02.000Z' : null,
    retryAfterMs: terminal ? null : 1_000,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('CLI processing commands', () => {
  it('documents finite waiting and resumable no-wait controls in command help', async () => {
    const applicationHelp: string[] = []
    const drainHelp: string[] = []

    expect(await runCli(
      ['applications', 'analyze-missing', '--help'],
      { stdout: value => applicationHelp.push(value), stderr: () => {} },
    )).toBe(0)
    expect(await runCli(
      ['processing', 'drain', '--help'],
      { stdout: value => drainHelp.push(value), stderr: () => {} },
    )).toBe(0)

    expect(applicationHelp.join('\n')).toContain('--no-wait')
    expect(applicationHelp.join('\n')).toContain('--timeout <seconds>')
    expect(applicationHelp.join('\n')).toContain('--poll-interval <ms>')
    expect(drainHelp.join('\n')).toContain('<batchId>')
    expect(drainHelp.join('\n')).not.toContain('--no-wait')
  })

  it('gets a sanitized batch for resumable inspection', async () => {
    const config = authedConfig()
    const stdout: string[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/processing/batch_1')
      expect(init?.method).toBe('GET')
      return Response.json(batch('pending'))
    })

    const exit = await runCli(
      ['processing', 'get', 'batch_1', '--config', config, '--json'],
      { stdout: value => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exit).toBe(0)
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      batchId: 'batch_1',
      status: 'pending',
      counts: { total: 1 },
    })
  })

  it('resumes and drains a batch to a stable terminal response', async () => {
    const config = authedConfig()
    const stdout: string[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/processing/batch_1' && init?.method === 'GET') {
        return Response.json(batch('pending'))
      }
      if (url === 'https://careers.example.com/api/processing/batch_1/drain' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ limit: 5 })
        return Response.json(batch('completed'))
      }
      throw new Error(`Unexpected request ${init?.method} ${url}`)
    })

    const exit = await runCli(
      ['processing', 'drain', 'batch_1', '--yes', '--timeout', '30', '--poll-interval', '250', '--config', config, '--json'],
      {
        stdout: value => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        sleep: async () => {},
      },
    )

    expect(exit).toBe(0)
    expect(stdout).toHaveLength(1)
    expect(JSON.parse(stdout[0]!)).toEqual(batch('completed'))
  })

  it('bounds the initial processing batch lookup with the same command timeout', async () => {
    vi.useFakeTimers()
    const config = authedConfig()
    const stdout: string[] = []
    let requestSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    })

    const running = runCli(
      ['processing', 'drain', 'batch_1', '--yes', '--timeout', '1', '--config', config, '--json'],
      { stdout: value => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const result = expect(running).resolves.toBe(1)

    await vi.advanceTimersByTimeAsync(1_000)
    await result

    expect(requestSignal?.aborted).toBe(true)
    expect(stdout).toHaveLength(1)
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      code: 'PROCESSING_TIMEOUT',
      details: { batchId: 'batch_1' },
    })
  })

  it.each(['failed', 'cancelled'] as const)('exits nonzero with the single %s terminal response', async (status) => {
    const config = authedConfig()
    const stdout: string[] = []
    const fetchMock = vi.fn(async () => Response.json(batch(status)))

    const exit = await runCli(
      ['processing', 'drain', 'batch_1', '--yes', '--config', config, '--json'],
      { stdout: value => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exit).toBe(1)
    expect(stdout).toHaveLength(1)
    expect(JSON.parse(stdout[0]!)).toEqual(batch(status))
  })
})
