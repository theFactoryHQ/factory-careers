import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-properties-'))
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

describe('CLI properties commands', () => {
  it('lists properties with query filters', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/properties?entityType=application&jobId=job_1&jobOnly=1')
      expect(init?.method).toBe('GET')
      return Response.json([{ id: 'prop_1', name: 'Location' }])
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['properties', 'list', '--entity-type', 'application', '--job-id', 'job_1', '--job-only', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual([{ id: 'prop_1', name: 'Location' }])
  })

  it('creates and reorders properties from stdin JSON', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/properties') {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({ entityType: 'candidate', type: 'text', name: 'Location' })
        return Response.json({ id: 'prop_1', name: 'Location' })
      }
      if (url === 'https://careers.example.com/api/properties/reorder') {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({ ids: ['prop_1', 'prop_2'] })
        return Response.json({ ok: true })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const createOut: string[] = []
    const reorderOut: string[] = []

    const createExit = await runCli(
      ['properties', 'create', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => createOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ entityType: 'candidate', type: 'text', name: 'Location' }),
      },
    )
    const reorderExit = await runCli(
      ['properties', 'reorder', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => reorderOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ ids: ['prop_1', 'prop_2'] }),
      },
    )

    expect(createExit).toBe(0)
    expect(reorderExit).toBe(0)
    expect(JSON.parse(createOut[0])).toEqual({ id: 'prop_1', name: 'Location' })
    expect(JSON.parse(reorderOut[0])).toEqual({ ok: true })
  })
})
