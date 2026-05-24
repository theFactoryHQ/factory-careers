import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../cli/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-auth-'))
  tempDirs.push(dir)
  return dir
}

function readConfig(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as {
    activeProfile?: string
    profiles?: Record<string, { baseUrl?: string; token?: string }>
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('CLI auth commands', () => {
  it('logs in with device authorization and persists the returned bearer token', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/auth/device/code') {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          client_id: 'factory-careers-cli',
          scope: 'openid profile email',
        })
        return Response.json({
          device_code: 'device-123',
          user_code: 'ABCD-2345',
          verification_uri: 'https://careers.example.com/device',
          verification_uri_complete: 'https://careers.example.com/device?user_code=ABCD-2345',
          expires_in: 1800,
          interval: 5,
        })
      }

      if (url === 'https://careers.example.com/api/auth/device/token') {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: 'device-123',
          client_id: 'factory-careers-cli',
        })
        return Response.json({
          access_token: 'signed-session-token',
          token_type: 'bearer',
          expires_in: 86400,
          scope: 'openid profile email',
        })
      }

      throw new Error(`Unexpected URL ${url}`)
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['auth', 'login', '--base-url', 'https://careers.example.com', '--config', configPath, '--json'],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        sleep: async () => {},
      },
    )

    expect(exitCode).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(readConfig(configPath)).toEqual({
      activeProfile: 'default',
      profiles: {
        default: {
          baseUrl: 'https://careers.example.com',
          token: 'signed-session-token',
        },
      },
    })
    expect(JSON.parse(stdout.at(-1) || '{}')).toEqual({
      authenticated: true,
      profile: 'default',
      baseUrl: 'https://careers.example.com',
    })
  })

  it('honors authorization_pending and slow_down polling responses before login succeeds', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    let tokenPolls = 0
    const sleeps: number[] = []
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://careers.example.com/api/auth/device/code') {
        return Response.json({
          device_code: 'device-123',
          user_code: 'ABCD-2345',
          verification_uri: 'https://careers.example.com/device',
          verification_uri_complete: 'https://careers.example.com/device?user_code=ABCD-2345',
          expires_in: 1800,
          interval: 2,
        })
      }

      if (url === 'https://careers.example.com/api/auth/device/token') {
        tokenPolls++
        if (tokenPolls === 1) {
          return Response.json({ code: 'authorization_pending', message: 'Pending' }, { status: 400 })
        }
        if (tokenPolls === 2) {
          return Response.json({ code: 'slow_down', message: 'Slow down' }, { status: 400 })
        }
        return Response.json({
          access_token: 'signed-session-token',
          token_type: 'bearer',
          expires_in: 86400,
          scope: 'openid profile email',
        })
      }

      throw new Error(`Unexpected URL ${url}`)
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['auth', 'login', '--base-url', 'https://careers.example.com', '--config', configPath, '--json'],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        sleep: async (ms) => {
          sleeps.push(ms)
        },
      },
    )

    expect(exitCode).toBe(0)
    expect(tokenPolls).toBe(3)
    expect(sleeps).toEqual([2000, 7000])
    expect(readConfig(configPath).profiles?.default?.token).toBe('signed-session-token')
  })

  it('returns structured device login errors without persisting a token for denied or expired authorization', async () => {
    for (const errorCode of ['access_denied', 'expired_token']) {
      const dir = tempDir()
      const configPath = join(dir, `${errorCode}.json`)
      const fetchMock = vi.fn(async (url: string) => {
        if (url === 'https://careers.example.com/api/auth/device/code') {
          return Response.json({
            device_code: 'device-123',
            user_code: 'ABCD-2345',
            verification_uri: 'https://careers.example.com/device',
            verification_uri_complete: 'https://careers.example.com/device?user_code=ABCD-2345',
            expires_in: 1800,
            interval: 1,
          })
        }

        if (url === 'https://careers.example.com/api/auth/device/token') {
          return Response.json({ code: errorCode, message: errorCode }, { status: 400 })
        }

        throw new Error(`Unexpected URL ${url}`)
      })
      const stdout: string[] = []

      const exitCode = await runCli(
        ['auth', 'login', '--base-url', 'https://careers.example.com', '--config', configPath, '--json'],
        {
          stdout: (value) => stdout.push(value),
          stderr: () => {},
          fetch: fetchMock as typeof fetch,
          sleep: async () => {},
        },
      )

      expect(exitCode).toBe(1)
      expect(JSON.parse(stdout.at(-1) || '{}')).toEqual({
        status: 400,
        code: errorCode,
        message: errorCode,
      })
      expect(existsSync(configPath)).toBe(false)
    }
  })

  it('logs out by removing only the active profile token', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({
      activeProfile: 'prod',
      profiles: {
        prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' },
        local: { baseUrl: 'http://localhost:3000', token: 'local-token' },
      },
    }))
    const stdout: string[] = []

    const exitCode = await runCli(
      ['auth', 'logout', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {} },
    )

    expect(exitCode).toBe(0)
    expect(readConfig(configPath)).toEqual({
      activeProfile: 'prod',
      profiles: {
        prod: { baseUrl: 'https://careers.example.com' },
        local: { baseUrl: 'http://localhost:3000', token: 'local-token' },
      },
    })
    expect(JSON.parse(stdout[0])).toEqual({
      authenticated: false,
      profile: 'prod',
      baseUrl: 'https://careers.example.com',
    })
  })

  it('prints the current user from a bearer-authenticated session', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({
      activeProfile: 'prod',
      profiles: {
        prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' },
      },
    }))
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/auth/get-session')
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer secret-token',
      })
      return Response.json({
        user: { id: 'user_1', email: 'doug@thefactoryhq.com', name: 'Doug' },
        session: { activeOrganizationId: 'org_1' },
      })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['auth', 'whoami', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({
      profile: 'prod',
      baseUrl: 'https://careers.example.com',
      user: { id: 'user_1', email: 'doug@thefactoryhq.com', name: 'Doug' },
      activeOrganizationId: 'org_1',
    })
  })

  it('returns a structured JSON error when whoami has no token', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    const stdout: string[] = []

    const exitCode = await runCli(
      ['auth', 'whoami', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {} },
    )

    expect(exitCode).toBe(1)
    expect(JSON.parse(stdout[0])).toEqual({
      status: 401,
      code: 'NOT_AUTHENTICATED',
      message: 'Run factory-careers auth login first.',
    })
    expect(existsSync(configPath)).toBe(false)
  })
})
