import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []
function authedConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-erasure-'))
  tempDirs.push(dir)
  const path = join(dir, 'config.json')
  writeFileSync(path, JSON.stringify({
    activeProfile: 'prod',
    profiles: { prod: { baseUrl: 'https://careers.example.test', token: 'test-token' } },
  }))
  return path
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('document erasure operations CLI', () => {
  it('returns the authenticated aggregate status as JSON', async () => {
    const stdout: string[] = []
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://careers.example.test/api/operations/document-erasure')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' })
      return Response.json({ ok: true, code: 'document_erasure_status', counts: { pending: 0 } })
    }) as typeof globalThis.fetch

    const code = await runCli([
      'operations', 'document-erasure', 'status', '--json', '--config', authedConfig(),
    ], { fetch, stdout: value => stdout.push(value) })
    expect(code).toBe(0)
    expect(JSON.parse(stdout[0]!)).toEqual({ ok: true, code: 'document_erasure_status', counts: { pending: 0 } })
  })

  it('makes no request when drain lacks explicit confirmation', async () => {
    const fetch = vi.fn() as typeof globalThis.fetch
    const stdout: string[] = []
    const code = await runCli([
      'operations', 'document-erasure', 'drain', '--limit', '10', '--json', '--config', authedConfig(),
    ], { fetch, stdout: value => stdout.push(value) })
    expect(code).toBe(1)
    expect(fetch).not.toHaveBeenCalled()
    expect(JSON.parse(stdout[0]!)).toMatchObject({ code: 'CONFIRMATION_REQUIRED' })
  })

  it('sends a confirmed bounded drain and preserves structured authorization failures', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      return Response.json({ statusMessage: 'Forbidden' }, { status: 403 })
    }) as typeof globalThis.fetch
    const stdout: string[] = []
    const code = await runCli([
      'operations', 'document-erasure', 'drain', '--yes', '--limit', '7', '--json', '--config', authedConfig(),
    ], { fetch, stdout: value => stdout.push(value) })

    expect(code).toBe(1)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('https://careers.example.test/api/operations/document-erasure/drain')
    expect(requests[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ confirm: true, limit: 7 })
    expect(JSON.parse(stdout[0]!)).toMatchObject({ status: 403 })
  })
})
