import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-org-'))
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

describe('CLI org commands', () => {
  it('searches organizations for join-request workflows', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/org-search?q=factory')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json([{ id: 'org_1', name: 'Factory', slug: 'factory' }])
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['org', 'search', 'factory', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual([{ id: 'org_1', name: 'Factory', slug: 'factory' }])
  })

  it('reads and updates organization settings', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/org-settings' && init?.method === 'GET') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        return Response.json({ nameDisplayFormat: 'first_last', dateFormat: 'mdy' })
      }
      if (url === 'https://careers.example.com/api/org-settings' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ dateFormat: 'ymd' })
        return Response.json({ nameDisplayFormat: 'first_last', dateFormat: 'ymd', calendarSyncInterviewers: false })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const settingsOut: string[] = []
    const updateOut: string[] = []

    const settingsExit = await runCli(
      ['org', 'settings', '--config', configPath, '--json'],
      { stdout: (value) => settingsOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const updateExit = await runCli(
      ['org', 'update-settings', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => updateOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ dateFormat: 'ymd' }),
      },
    )

    expect(settingsExit).toBe(0)
    expect(updateExit).toBe(0)
    expect(JSON.parse(settingsOut[0])).toEqual({ nameDisplayFormat: 'first_last', dateFormat: 'mdy' })
    expect(JSON.parse(updateOut[0])).toEqual({ nameDisplayFormat: 'first_last', dateFormat: 'ymd', calendarSyncInterviewers: false })
  })

  it('lists, creates, and revokes invite links', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const token = 'a'.repeat(64)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `https://careers.example.com/api/invite-links/info/${token}` && init?.method === 'GET') {
        expect(init.headers).not.toHaveProperty('Authorization')
        return Response.json({
          organizationName: 'Factory',
          organizationSlug: 'factory',
          role: 'member',
          invitedByName: 'Doug',
          expiresAt: '2026-06-01T00:00:00.000Z',
        })
      }
      if (url === 'https://careers.example.com/api/invite-links' && init?.method === 'GET') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        return Response.json([{ id: 'invite_1', role: 'member' }])
      }
      if (url === 'https://careers.example.com/api/invite-links' && init?.method === 'POST') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        expect(JSON.parse(String(init.body))).toEqual({ role: 'admin', maxUses: 5, expiresInHours: 24 })
        return Response.json({ id: 'invite_2', role: 'admin', token: 'tok_2' }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/invite-links/accept' && init?.method === 'POST') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        expect(JSON.parse(String(init.body))).toEqual({ token })
        return Response.json({ success: true, organizationId: 'org_1', organizationName: 'Factory', role: 'member' })
      }
      if (url === 'https://careers.example.com/api/invite-links/invite_2' && init?.method === 'DELETE') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        return Response.json({ success: true })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const infoOut: string[] = []
    const listOut: string[] = []
    const createOut: string[] = []
    const acceptOut: string[] = []
    const revokeOut: string[] = []

    const infoExit = await runCli(
      ['org', 'invite-links', 'info', token, '--config', configPath, '--json'],
      { stdout: (value) => infoOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const listExit = await runCli(
      ['org', 'invite-links', 'list', '--config', configPath, '--json'],
      { stdout: (value) => listOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const createExit = await runCli(
      ['org', 'invite-links', 'create', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => createOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ role: 'admin', maxUses: 5, expiresInHours: 24 }),
      },
    )
    const acceptExit = await runCli(
      ['org', 'invite-links', 'accept', '--stdin', '--config', configPath, '--json'],
      {
        stdout: (value) => acceptOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ token }),
      },
    )
    const revokeExit = await runCli(
      ['org', 'invite-links', 'revoke', 'invite_2', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => revokeOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(infoExit).toBe(0)
    expect(listExit).toBe(0)
    expect(createExit).toBe(0)
    expect(acceptExit).toBe(0)
    expect(revokeExit).toBe(0)
    expect(JSON.parse(infoOut[0])).toEqual({
      organizationName: 'Factory',
      organizationSlug: 'factory',
      role: 'member',
      invitedByName: 'Doug',
      expiresAt: '2026-06-01T00:00:00.000Z',
    })
    expect(JSON.parse(listOut[0])).toEqual([{ id: 'invite_1', role: 'member' }])
    expect(JSON.parse(createOut[0])).toEqual({ id: 'invite_2', role: 'admin', token: 'tok_2' })
    expect(JSON.parse(acceptOut[0])).toEqual({ success: true, organizationId: 'org_1', organizationName: 'Factory', role: 'member' })
    expect(JSON.parse(revokeOut[0])).toEqual({ success: true })
  })

  it('creates, lists, approves, and rejects join requests', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/join-requests' && init?.method === 'GET') {
        return Response.json([{ id: 'join_1', status: 'pending', userEmail: 'ada@example.com' }])
      }
      if (url === 'https://careers.example.com/api/join-requests' && init?.method === 'POST') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        expect(JSON.parse(String(init.body))).toEqual({
          organizationId: 'org_1',
          message: 'I work with the hiring team.',
        })
        return Response.json({
          id: 'join_3',
          status: 'pending',
          organizationName: 'Factory',
        }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/join-requests/join_1/approve' && init?.method === 'POST') {
        return Response.json({ success: true, memberId: 'member_1', role: 'member' })
      }
      if (url === 'https://careers.example.com/api/join-requests/join_2/reject' && init?.method === 'POST') {
        return Response.json({ success: true })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const listOut: string[] = []
    const createOut: string[] = []
    const approveOut: string[] = []
    const rejectOut: string[] = []

    const listExit = await runCli(
      ['org', 'join-requests', 'list', '--config', configPath, '--json'],
      { stdout: (value) => listOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const createExit = await runCli(
      ['org', 'join-requests', 'create', '--stdin', '--config', configPath, '--json'],
      {
        stdout: (value) => createOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({
          organizationId: 'org_1',
          message: 'I work with the hiring team.',
        }),
      },
    )
    const approveExit = await runCli(
      ['org', 'join-requests', 'approve', 'join_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => approveOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const rejectExit = await runCli(
      ['org', 'join-requests', 'reject', 'join_2', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => rejectOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(listExit).toBe(0)
    expect(createExit).toBe(0)
    expect(approveExit).toBe(0)
    expect(rejectExit).toBe(0)
    expect(JSON.parse(listOut[0])).toEqual([{ id: 'join_1', status: 'pending', userEmail: 'ada@example.com' }])
    expect(JSON.parse(createOut[0])).toEqual({ id: 'join_3', status: 'pending', organizationName: 'Factory' })
    expect(JSON.parse(approveOut[0])).toEqual({ success: true, memberId: 'member_1', role: 'member' })
    expect(JSON.parse(rejectOut[0])).toEqual({ success: true })
  })

  it('lists, registers, and deletes SSO providers', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/sso/providers' && init?.method === 'GET') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        return Response.json([{ id: 'sso_1', providerId: 'factory-sso', domain: 'thefactoryhq.com' }])
      }
      if (url === 'https://careers.example.com/api/sso/providers' && init?.method === 'POST') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        expect(JSON.parse(String(init.body))).toEqual({
          providerId: 'factory-sso',
          issuer: 'https://login.microsoftonline.com/tenant/v2.0',
          domain: 'thefactoryhq.com',
          clientId: 'client-id',
          clientSecret: 'client-secret',
        })
        return Response.json({
          id: 'sso_2',
          providerId: 'factory-sso',
          issuer: 'https://login.microsoftonline.com/tenant/v2.0',
          domain: 'thefactoryhq.com',
        }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/sso/providers/sso_2' && init?.method === 'DELETE') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        return Response.json({ success: true })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const listOut: string[] = []
    const registerOut: string[] = []
    const deleteOut: string[] = []

    const listExit = await runCli(
      ['org', 'sso-providers', 'list', '--config', configPath, '--json'],
      { stdout: (value) => listOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const registerExit = await runCli(
      ['org', 'sso-providers', 'register', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => registerOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({
          providerId: 'factory-sso',
          issuer: 'https://login.microsoftonline.com/tenant/v2.0',
          domain: 'thefactoryhq.com',
          clientId: 'client-id',
          clientSecret: 'client-secret',
        }),
      },
    )
    const deleteExit = await runCli(
      ['org', 'sso-providers', 'delete', 'sso_2', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => deleteOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(listExit).toBe(0)
    expect(registerExit).toBe(0)
    expect(deleteExit).toBe(0)
    expect(JSON.parse(listOut[0])).toEqual([{ id: 'sso_1', providerId: 'factory-sso', domain: 'thefactoryhq.com' }])
    expect(JSON.parse(registerOut[0])).toEqual({
      id: 'sso_2',
      providerId: 'factory-sso',
      issuer: 'https://login.microsoftonline.com/tenant/v2.0',
      domain: 'thefactoryhq.com',
    })
    expect(JSON.parse(deleteOut[0])).toEqual({ success: true })
  })
})
