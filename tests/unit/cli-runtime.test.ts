import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveActiveProfile, resolveConfigPath, saveProfile } from '../../packages/careers-cli/src/config'
import { normalizeCliError } from '../../packages/careers-cli/src/errors'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('CLI runtime foundation', () => {
  it('resolves OS-specific config paths and lets --config override them', () => {
    const home = '/Users/tester'

    expect(resolveConfigPath({ home, platform: 'darwin' })).toBe(
      '/Users/tester/Library/Application Support/factory-careers/config.json',
    )
    expect(resolveConfigPath({ home, platform: 'linux' })).toBe(
      '/Users/tester/.config/factory-careers/config.json',
    )
    expect(resolveConfigPath({ home, platform: 'win32' })).toBe(
      '/Users/tester/AppData/Roaming/factory-careers/config.json',
    )
    expect(resolveConfigPath({ home, platform: 'darwin', explicitConfig: '/tmp/config.json' })).toBe(
      '/tmp/config.json',
    )
  })

  it('resolves active profile with deterministic --profile and --base-url precedence', () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({
      activeProfile: 'prod',
      profiles: {
        prod: { baseUrl: 'https://careers.thefactoryhq.com', token: 'prod-token' },
        local: { baseUrl: 'http://localhost:3000', token: 'local-token' },
      },
    }))

    expect(resolveActiveProfile({ configPath })).toMatchObject({
      profileName: 'prod',
      baseUrl: 'https://careers.thefactoryhq.com',
      token: 'prod-token',
    })
    expect(resolveActiveProfile({ configPath, profile: 'local', baseUrl: 'http://127.0.0.1:3333' })).toMatchObject({
      profileName: 'local',
      baseUrl: 'http://127.0.0.1:3333',
      token: 'local-token',
    })
  })

  it('writes CLI token config with owner-only file permissions', () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')

    saveProfile({
      configPath,
      profileName: 'prod',
      baseUrl: 'https://careers.example.com',
      token: 'secret-token',
    })

    expect(statSync(configPath).mode & 0o777).toBe(0o600)
  })

  it('normalizes API errors into stable JSON-safe fields', async () => {
    const error = normalizeCliError({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Forbidden',
      details: { permission: 'job:create' },
    })

    expect(error).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Forbidden',
      details: { permission: 'job:create' },
    })
  })

  it('uses h3 status messages for API errors without a message field', async () => {
    const error = normalizeCliError({
      statusCode: 404,
      statusMessage: 'Invalid, expired, or revoked invite link',
    })

    expect(error).toEqual({
      status: 404,
      code: 'CLI_ERROR',
      message: 'Invalid, expired, or revoked invite link',
    })
  })

  it('prints auth status as JSON without leaking tokens', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({
      activeProfile: 'prod',
      profiles: {
        prod: { baseUrl: 'https://careers.thefactoryhq.com', token: 'secret-token' },
      },
    }))
    const stdout: string[] = []

    const exitCode = await runCli(
      ['auth', 'status', '--json', '--config', configPath],
      { stdout: (value) => stdout.push(value), stderr: () => {} },
    )

    expect(exitCode).toBe(0)
    expect(stdout).toHaveLength(1)
    expect(stdout[0]).not.toContain('secret-token')
    expect(JSON.parse(stdout[0])).toEqual({
      authenticated: true,
      profile: 'prod',
      baseUrl: 'https://careers.thefactoryhq.com',
    })
  })

  it('does not treat help output as a CLI error', async () => {
    const stderr: string[] = []

    const exitCode = await runCli(
      ['jobs', '--help'],
      { stdout: () => {}, stderr: (value) => stderr.push(value) },
    )

    expect(exitCode).toBe(0)
    expect(stderr).toEqual([])
  })
})
