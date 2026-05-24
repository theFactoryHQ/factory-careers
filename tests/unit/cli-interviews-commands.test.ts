import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../cli/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-interviews-'))
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

describe('CLI interview commands', () => {
  it('lists interviews with filters and gets an interview by ID', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/interviews?page=2&limit=10&applicationId=app_1&jobId=job_1&status=scheduled&from=2026-05-25T00%3A00%3A00.000Z&to=2026-05-31T00%3A00%3A00.000Z') {
        expect(init?.method).toBe('GET')
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        return Response.json({ data: [{ id: 'int_1', title: 'Screen' }], total: 1, page: 2, limit: 10 })
      }
      if (url === 'https://careers.example.com/api/interviews/int_1') {
        expect(init?.method).toBe('GET')
        return Response.json({ id: 'int_1', title: 'Screen', calendarEvents: [] })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const listOut: string[] = []
    const getOut: string[] = []

    const listExit = await runCli(
      [
        'interviews',
        'list',
        '--page',
        '2',
        '--limit',
        '10',
        '--application-id',
        'app_1',
        '--job-id',
        'job_1',
        '--status',
        'scheduled',
        '--from',
        '2026-05-25T00:00:00.000Z',
        '--to',
        '2026-05-31T00:00:00.000Z',
        '--config',
        configPath,
        '--json',
      ],
      { stdout: (value) => listOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const getExit = await runCli(
      ['interviews', 'get', 'int_1', '--config', configPath, '--json'],
      { stdout: (value) => getOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(listExit).toBe(0)
    expect(getExit).toBe(0)
    expect(JSON.parse(listOut[0])).toEqual({ data: [{ id: 'int_1', title: 'Screen' }], total: 1, page: 2, limit: 10 })
    expect(JSON.parse(getOut[0])).toEqual({ id: 'int_1', title: 'Screen', calendarEvents: [] })
  })

  it('schedules and updates interviews from stdin JSON', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/interviews' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          applicationId: 'app_1',
          title: 'Technical interview',
          type: 'technical',
          scheduledAt: '2026-06-01T17:00:00.000Z',
          duration: 60,
          calendarSync: false,
        })
        return Response.json({ id: 'int_1', title: 'Technical interview' }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/interviews/int_1' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ status: 'cancelled' })
        return Response.json({ id: 'int_1', status: 'cancelled' })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const createOut: string[] = []
    const updateOut: string[] = []

    const createExit = await runCli(
      ['interviews', 'schedule', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => createOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({
          applicationId: 'app_1',
          title: 'Technical interview',
          type: 'technical',
          scheduledAt: '2026-06-01T17:00:00.000Z',
          duration: 60,
          calendarSync: false,
        }),
      },
    )
    const updateExit = await runCli(
      ['interviews', 'update', 'int_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => updateOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ status: 'cancelled' }),
      },
    )

    expect(createExit).toBe(0)
    expect(updateExit).toBe(0)
    expect(JSON.parse(createOut[0])).toEqual({ id: 'int_1', title: 'Technical interview' })
    expect(JSON.parse(updateOut[0])).toEqual({ id: 'int_1', status: 'cancelled' })
  })

  it.each(['delete', 'cancel'])('sends interview invitations and %s interviews with confirmation', async (deleteCommand) => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/interviews/int_1/send-invitation' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ templateId: 'system_interview_invite' })
        return Response.json({ success: true, candidateEmail: 'ada@example.com' })
      }
      if (url === 'https://careers.example.com/api/interviews/int_1' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const inviteOut: string[] = []
    const deleteOut: string[] = []

    const inviteExit = await runCli(
      ['interviews', 'send-invitation', 'int_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => inviteOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ templateId: 'system_interview_invite' }),
      },
    )
    const deleteExit = await runCli(
      ['interviews', deleteCommand, 'int_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => deleteOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(inviteExit).toBe(0)
    expect(deleteExit).toBe(0)
    expect(JSON.parse(inviteOut[0])).toEqual({ success: true, candidateEmail: 'ada@example.com' })
    expect(JSON.parse(deleteOut[0])).toEqual({ deleted: true, id: 'int_1' })
  })
})
