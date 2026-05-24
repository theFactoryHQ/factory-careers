import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../cli/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-calendar-'))
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

describe('CLI calendar commands', () => {
  it('fetches calendar status', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/calendar/status')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({ available: true, connected: false, providerLabel: 'Google Calendar' })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['calendar', 'status', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ available: true, connected: false, providerLabel: 'Google Calendar' })
  })

  it('prints provider connect instructions as stable URLs', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const stdout: string[] = []

    const exitCode = await runCli(
      ['calendar', 'connect', 'microsoft', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {} },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({
      provider: 'microsoft',
      url: 'https://careers.example.com/api/calendar/microsoft/connect',
    })
  })

  it('disconnects calendar integrations and renews webhooks with confirmation', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/calendar/disconnect' && init?.method === 'POST') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        return Response.json({ success: true })
      }
      if (url === 'https://careers.example.com/api/calendar/renew-webhooks' && init?.method === 'POST') {
        return Response.json({ total: 2, renewed: 2, failed: 0 })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const disconnectOut: string[] = []
    const renewOut: string[] = []

    const disconnectExit = await runCli(
      ['calendar', 'disconnect', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => disconnectOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const renewExit = await runCli(
      ['calendar', 'renew-webhooks', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => renewOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(disconnectExit).toBe(0)
    expect(renewExit).toBe(0)
    expect(JSON.parse(disconnectOut[0])).toEqual({ success: true })
    expect(JSON.parse(renewOut[0])).toEqual({ total: 2, renewed: 2, failed: 0 })
  })
})
