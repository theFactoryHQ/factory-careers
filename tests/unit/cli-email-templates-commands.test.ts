import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../cli/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-email-templates-'))
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

describe('CLI email template commands', () => {
  it('lists email templates', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/email-templates')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json([{ id: 'tmpl_1', name: 'Interview invite' }])
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['email-templates', 'list', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual([{ id: 'tmpl_1', name: 'Interview invite' }])
  })

  it('creates and updates email templates from stdin JSON', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/email-templates' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          name: 'Interview invite',
          subject: 'Interview with Factory',
          body: 'Hello {{candidateName}}',
        })
        return Response.json({ id: 'tmpl_1', name: 'Interview invite' }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/email-templates/tmpl_1' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ subject: 'Updated subject' })
        return Response.json({ id: 'tmpl_1', subject: 'Updated subject' })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const createOut: string[] = []
    const updateOut: string[] = []

    const createExit = await runCli(
      ['email-templates', 'create', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => createOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({
          name: 'Interview invite',
          subject: 'Interview with Factory',
          body: 'Hello {{candidateName}}',
        }),
      },
    )
    const updateExit = await runCli(
      ['email-templates', 'update', 'tmpl_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => updateOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ subject: 'Updated subject' }),
      },
    )

    expect(createExit).toBe(0)
    expect(updateExit).toBe(0)
    expect(JSON.parse(createOut[0])).toEqual({ id: 'tmpl_1', name: 'Interview invite' })
    expect(JSON.parse(updateOut[0])).toEqual({ id: 'tmpl_1', subject: 'Updated subject' })
  })

  it('deletes an email template with confirmation', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/email-templates/tmpl_1')
      expect(init?.method).toBe('DELETE')
      return new Response(null, { status: 204 })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['email-templates', 'delete', 'tmpl_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ deleted: true, id: 'tmpl_1' })
  })
})
