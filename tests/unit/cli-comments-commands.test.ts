import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-comments-'))
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

describe('CLI comment commands', () => {
  it('lists comments for a target', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/comments?targetType=candidate&targetId=cand_1&page=2&limit=25')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({ data: [{ id: 'comment_1', body: 'Looks strong' }], total: 1, page: 2, limit: 25 })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['comments', 'list', '--target-type', 'candidate', '--target-id', 'cand_1', '--page', '2', '--limit', '25', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ data: [{ id: 'comment_1', body: 'Looks strong' }], total: 1, page: 2, limit: 25 })
  })

  it('creates a comment from stdin JSON', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/comments')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        targetType: 'candidate',
        targetId: 'cand_1',
        body: 'Schedule a follow-up.',
      })
      return Response.json({ id: 'comment_1', body: 'Schedule a follow-up.' }, { status: 201 })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['comments', 'create', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({
          targetType: 'candidate',
          targetId: 'cand_1',
          body: 'Schedule a follow-up.',
        }),
      },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'comment_1', body: 'Schedule a follow-up.' })
  })

  it('updates a comment body from stdin JSON', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/comments/comment_1')
      expect(init?.method).toBe('PATCH')
      expect(JSON.parse(String(init?.body))).toEqual({ body: 'Updated note' })
      return Response.json({ id: 'comment_1', body: 'Updated note' })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['comments', 'update', 'comment_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ body: 'Updated note' }),
      },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'comment_1', body: 'Updated note' })
  })

  it('deletes a comment with confirmation', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/comments/comment_1')
      expect(init?.method).toBe('DELETE')
      return new Response(null, { status: 204 })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['comments', 'delete', 'comment_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ deleted: true, id: 'comment_1' })
  })
})
