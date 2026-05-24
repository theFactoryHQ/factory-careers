import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-agent-workflow-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('CLI full agent workflow smoke', () => {
  it('runs login through dashboard summary with mocked endpoints', async () => {
    const configPath = join(tempDir(), 'config.json')
    const calls: string[] = []
    let tokenPolls = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)

      if (url.endsWith('/api/auth/device/code')) {
        return Response.json({
          device_code: 'device-123',
          user_code: 'ABCD-2345',
          verification_uri: 'https://careers.example.com/device',
          verification_uri_complete: 'https://careers.example.com/device?user_code=ABCD-2345',
          expires_in: 600,
          interval: 1,
        })
      }
      if (url.endsWith('/api/auth/device/token')) {
        tokenPolls += 1
        return Response.json({
          access_token: 'agent-token',
          token_type: 'bearer',
          expires_in: 3600,
          scope: 'openid',
        })
      }

      expect(init?.headers).toMatchObject({ Authorization: 'Bearer agent-token' })

      if (url.endsWith('/api/jobs')) return Response.json({ id: 'job_1' }, { status: 201 })
      if (url.endsWith('/api/jobs/job_1/questions')) return Response.json({ id: 'question_1' }, { status: 201 })
      if (url.endsWith('/api/candidates')) return Response.json({ id: 'cand_1' }, { status: 201 })
      if (url.endsWith('/api/applications')) return Response.json({ id: 'app_1' }, { status: 201 })
      if (url.endsWith('/api/applications/app_1')) return Response.json({ id: 'app_1', status: 'screening' })
      if (url.endsWith('/api/interviews')) return Response.json({ id: 'int_1' }, { status: 201 })
      if (url.endsWith('/api/comments')) return Response.json({ id: 'comment_1' }, { status: 201 })
      if (url.endsWith('/api/tracking-links')) return Response.json({ id: 'track_1', url: 'https://careers.example.com/t/abc' }, { status: 201 })
      if (url.endsWith('/api/dashboard/stats')) return Response.json({ openJobs: 1, totalCandidates: 1 })

      throw new Error(`Unhandled mock URL ${url}`)
    })
    const stdout: string[] = []
    const io = {
      stdout: (value: string) => stdout.push(value),
      stderr: () => {},
      fetch: fetchMock as typeof fetch,
      sleep: async () => {},
    }

    const commands: Array<{ argv: string[], stdin?: () => Promise<string> }> = [
      { argv: ['auth', 'login', '--config', configPath, '--base-url', 'https://careers.example.com', '--json'] },
      { argv: ['jobs', 'create', '--stdin', '--yes', '--config', configPath, '--json'], stdin: async () => JSON.stringify({ title: 'Engineer' }) },
      { argv: ['jobs', 'questions', 'create', 'job_1', '--stdin', '--yes', '--config', configPath, '--json'], stdin: async () => JSON.stringify({ label: 'Why Factory?' }) },
      { argv: ['candidates', 'create', '--stdin', '--yes', '--config', configPath, '--json'], stdin: async () => JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }) },
      { argv: ['applications', 'create', '--stdin', '--yes', '--config', configPath, '--json'], stdin: async () => JSON.stringify({ candidateId: 'cand_1', jobId: 'job_1' }) },
      { argv: ['applications', 'update', 'app_1', '--stdin', '--yes', '--config', configPath, '--json'], stdin: async () => JSON.stringify({ status: 'screening' }) },
      { argv: ['interviews', 'schedule', '--stdin', '--yes', '--config', configPath, '--json'], stdin: async () => JSON.stringify({ applicationId: 'app_1', title: 'Screen', scheduledAt: new Date().toISOString() }) },
      { argv: ['comments', 'create', '--stdin', '--yes', '--config', configPath, '--json'], stdin: async () => JSON.stringify({ targetType: 'application', targetId: 'app_1', body: 'Looks good' }) },
      { argv: ['source-tracking', 'create', '--stdin', '--yes', '--config', configPath, '--json'], stdin: async () => JSON.stringify({ jobId: 'job_1', channel: 'agent' }) },
      { argv: ['dashboard', 'summary', '--config', configPath, '--json'] },
    ]

    for (const command of commands) {
      const exitCode = await runCli(command.argv, { ...io, stdin: command.stdin })
      expect(exitCode, command.argv.join(' ')).toBe(0)
    }

    expect(tokenPolls).toBe(1)
    expect(calls).toContain('POST https://careers.example.com/api/auth/device/code')
    expect(calls).toContain('GET https://careers.example.com/api/dashboard/stats')
  })
})
