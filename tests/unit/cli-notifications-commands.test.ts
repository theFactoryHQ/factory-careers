import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function authedConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-notifications-'))
  tempDirs.push(dir)
  const path = join(dir, 'config.json')
  writeFileSync(path, JSON.stringify({
    activeProfile: 'prod',
    profiles: { prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' } },
  }))
  return path
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('CLI notification commands', () => {
  it('gets personal and inbox settings', async () => {
    const config = authedConfig()
    const requests: string[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push(`${init?.method}:${url}`)
      return Response.json({ cadence: 'off' })
    })

    expect(await runCli(['notifications', 'personal', 'get', '--config', config, '--json'], {
      stdout: () => {}, stderr: () => {}, fetch: fetchMock as typeof fetch,
    })).toBe(0)
    expect(await runCli(['notifications', 'inbox', 'get', '--config', config, '--json'], {
      stdout: () => {}, stderr: () => {}, fetch: fetchMock as typeof fetch,
    })).toBe(0)

    expect(requests).toEqual([
      'GET:https://careers.example.com/api/notification-preferences/application-email',
      'GET:https://careers.example.com/api/notification-settings/application-email',
    ])
  })

  it('sets personal and inbox settings from validated stdin JSON', async () => {
    const config = authedConfig()
    const payload = {
      cadence: 'weekly',
      timeZone: 'America/New_York',
      deliveryTime: '09:00',
      weeklyDay: 1,
      monthlyDay: 1,
    }
    const requests: Array<{ method?: string, url: string, body: unknown }> = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ method: init?.method, url, body: JSON.parse(String(init?.body)) })
      return Response.json(payload)
    })

    expect(await runCli(['notifications', 'personal', 'set', '--stdin', '--yes', '--config', config, '--json'], {
      stdout: () => {}, stderr: () => {}, fetch: fetchMock as typeof fetch, stdin: async () => JSON.stringify(payload),
    })).toBe(0)
    expect(await runCli(['notifications', 'inbox', 'set', '--stdin', '--yes', '--config', config, '--json'], {
      stdout: () => {}, stderr: () => {}, fetch: fetchMock as typeof fetch,
      stdin: async () => JSON.stringify({ ...payload, recipientEmail: 'careers@example.com' }),
    })).toBe(0)

    expect(requests).toEqual([
      { method: 'PUT', url: 'https://careers.example.com/api/notification-preferences/application-email', body: payload },
      {
        method: 'PATCH',
        url: 'https://careers.example.com/api/notification-settings/application-email',
        body: { ...payload, recipientEmail: 'careers@example.com' },
      },
    ])
  })

  it('rejects invalid schedule payloads before making a request', async () => {
    const fetchMock = vi.fn()
    const output: string[] = []
    const exitCode = await runCli(
      ['notifications', 'personal', 'set', '--stdin', '--yes', '--config', authedConfig(), '--json'],
      {
        stdout: value => output.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ cadence: 'hourly' }),
      },
    )

    expect(exitCode).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.parse(output[0])).toMatchObject({ code: 'INVALID_STDIN_PAYLOAD' })
  })
})
