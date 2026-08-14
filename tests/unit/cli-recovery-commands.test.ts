import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []
function authedConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-recovery-'))
  tempDirs.push(dir)
  const path = join(dir, 'config.json')
  writeFileSync(path, JSON.stringify({
    activeProfile: 'prod',
    profiles: { prod: { baseUrl: 'https://careers.example.com', token: 'test-token' } },
  }))
  return path
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('application intake recovery CLI', () => {
  it('lists metadata with authentication', async () => {
    const stdout: string[] = []
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain('/api/application-intake-recovery')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' })
      return Response.json({ receipts: [] })
    }) as typeof globalThis.fetch
    const config = authedConfig()
    const code = await runCli([
      'recovery', 'list', '--json', '--config', config,
    ], { stdout: value => stdout.push(value), fetch })
    expect(code).toBe(0)
    expect(JSON.parse(stdout[0]!)).toEqual({ receipts: [] })
  })

  it('requires explicit confirmation for replay and purge', async () => {
    const fetch = vi.fn(async () => Response.json({ success: true })) as typeof globalThis.fetch
    const config = authedConfig()
    expect(await runCli([
      'recovery', 'replay', '01915bb8-7f34-7a3e-8b3e-2d1db55bb71a', '--json',
      '--config', config,
    ], { fetch })).toBe(1)
    expect(fetch).not.toHaveBeenCalled()

    expect(await runCli([
      'recovery', 'purge', '--yes', '--json',
      '--config', config,
    ], { fetch })).toBe(0)
    expect(fetch).toHaveBeenCalledOnce()
  })
})
