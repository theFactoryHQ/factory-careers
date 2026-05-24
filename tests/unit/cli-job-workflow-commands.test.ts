import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../cli/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-job-workflows-'))
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

describe('CLI job workflow commands', () => {
  it('runs a full agent ATS workflow through authenticated CLI commands', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })

      if (url === 'https://careers.example.com/api/jobs' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ title: 'Agent Workflow Engineer', status: 'draft' })
        return Response.json({ id: 'job_1', title: 'Agent Workflow Engineer', status: 'draft' }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/jobs/job_1/questions' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ label: 'Portfolio URL', type: 'url', required: true })
        return Response.json({ id: 'question_1', label: 'Portfolio URL' }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/candidates' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
        })
        return Response.json({ id: 'cand_1', email: 'ada@example.com' }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/applications' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ candidateId: 'cand_1', jobId: 'job_1' })
        return Response.json({ id: 'app_1', candidateId: 'cand_1', jobId: 'job_1', status: 'new' }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/applications/app_1' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ status: 'interviewing' })
        return Response.json({ id: 'app_1', status: 'interviewing' })
      }
      if (url === 'https://careers.example.com/api/interviews' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          applicationId: 'app_1',
          title: 'Technical screen',
          type: 'technical',
          scheduledAt: '2026-06-01T17:00:00.000Z',
          duration: 60,
          calendarSync: false,
        })
        return Response.json({ id: 'int_1', title: 'Technical screen' }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/comments' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          targetType: 'application',
          targetId: 'app_1',
          content: 'Agent scheduled technical screen.',
        })
        return Response.json({ id: 'comment_1', targetId: 'app_1' }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/tracking-links' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          jobId: 'job_1',
          name: 'Agent launch',
          channel: 'linkedin',
        })
        return Response.json({ id: 'link_1', channel: 'linkedin' }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/dashboard/stats' && init?.method === 'GET') {
        return Response.json({ counts: { openJobs: 1, candidates: 1, applications: 1 }, pipeline: {}, jobsByStatus: {} })
      }
      throw new Error(`Unexpected URL ${url}`)
    })

    const runJsonCommand = async (args: string[], body?: unknown) => {
      const stdout: string[] = []
      const exitCode = await runCli(
        [...args, '--config', configPath, '--json'],
        {
          stdout: (value) => stdout.push(value),
          stderr: () => {},
          fetch: fetchMock as typeof fetch,
          stdin: async () => JSON.stringify(body),
        },
      )
      expect(exitCode).toBe(0)
      return JSON.parse(stdout[0])
    }

    await expect(runJsonCommand(
      ['jobs', 'create', '--stdin', '--yes'],
      { title: 'Agent Workflow Engineer', status: 'draft' },
    )).resolves.toMatchObject({ id: 'job_1' })
    await expect(runJsonCommand(
      ['jobs', 'questions', 'create', 'job_1', '--stdin', '--yes'],
      { label: 'Portfolio URL', type: 'url', required: true },
    )).resolves.toMatchObject({ id: 'question_1' })
    await expect(runJsonCommand(
      ['candidates', 'create', '--stdin', '--yes'],
      { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
    )).resolves.toMatchObject({ id: 'cand_1' })
    await expect(runJsonCommand(
      ['applications', 'create', '--stdin', '--yes'],
      { candidateId: 'cand_1', jobId: 'job_1' },
    )).resolves.toMatchObject({ id: 'app_1' })
    await expect(runJsonCommand(
      ['applications', 'status', 'app_1', 'interviewing', '--yes'],
    )).resolves.toEqual({ id: 'app_1', status: 'interviewing' })
    await expect(runJsonCommand(
      ['interviews', 'schedule', '--stdin', '--yes'],
      {
        applicationId: 'app_1',
        title: 'Technical screen',
        type: 'technical',
        scheduledAt: '2026-06-01T17:00:00.000Z',
        duration: 60,
        calendarSync: false,
      },
    )).resolves.toMatchObject({ id: 'int_1' })
    await expect(runJsonCommand(
      ['comments', 'create', '--stdin', '--yes'],
      { targetType: 'application', targetId: 'app_1', content: 'Agent scheduled technical screen.' },
    )).resolves.toMatchObject({ id: 'comment_1' })
    await expect(runJsonCommand(
      ['source-tracking', 'create', '--stdin', '--yes'],
      { jobId: 'job_1', name: 'Agent launch', channel: 'linkedin' },
    )).resolves.toMatchObject({ id: 'link_1' })
    await expect(runJsonCommand(
      ['dashboard', 'summary'],
    )).resolves.toEqual({ counts: { openJobs: 1, candidates: 1, applications: 1 }, pipeline: {}, jobsByStatus: {} })

    expect(fetchMock).toHaveBeenCalledTimes(9)
  })

  it('manages job questions', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/jobs/job_1/questions' && init?.method === 'GET') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        return Response.json([{ id: 'question_1', label: 'Portfolio' }])
      }
      if (url === 'https://careers.example.com/api/jobs/job_1/questions' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ label: 'Portfolio', type: 'url', required: true })
        return Response.json({ id: 'question_1', label: 'Portfolio' }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/jobs/job_1/questions/question_1' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ required: false })
        return Response.json({ id: 'question_1', required: false })
      }
      if (url === 'https://careers.example.com/api/jobs/job_1/questions/reorder' && init?.method === 'PUT') {
        expect(JSON.parse(String(init.body))).toEqual({ order: [{ id: 'question_1', displayOrder: 2 }] })
        return Response.json({ success: true })
      }
      if (url === 'https://careers.example.com/api/jobs/job_1/questions/question_1' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const listOut: string[] = []
    const createOut: string[] = []
    const updateOut: string[] = []
    const reorderOut: string[] = []
    const deleteOut: string[] = []

    const listExit = await runCli(
      ['jobs', 'questions', 'list', 'job_1', '--config', configPath, '--json'],
      { stdout: (value) => listOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const createExit = await runCli(
      ['jobs', 'questions', 'create', 'job_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => createOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ label: 'Portfolio', type: 'url', required: true }),
      },
    )
    const updateExit = await runCli(
      ['jobs', 'questions', 'update', 'job_1', 'question_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => updateOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ required: false }),
      },
    )
    const reorderExit = await runCli(
      ['jobs', 'questions', 'reorder', 'job_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => reorderOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ order: [{ id: 'question_1', displayOrder: 2 }] }),
      },
    )
    const deleteExit = await runCli(
      ['jobs', 'questions', 'delete', 'job_1', 'question_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => deleteOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(listExit).toBe(0)
    expect(createExit).toBe(0)
    expect(updateExit).toBe(0)
    expect(reorderExit).toBe(0)
    expect(deleteExit).toBe(0)
    expect(JSON.parse(listOut[0])).toEqual([{ id: 'question_1', label: 'Portfolio' }])
    expect(JSON.parse(createOut[0])).toEqual({ id: 'question_1', label: 'Portfolio' })
    expect(JSON.parse(updateOut[0])).toEqual({ id: 'question_1', required: false })
    expect(JSON.parse(reorderOut[0])).toEqual({ success: true })
    expect(JSON.parse(deleteOut[0])).toEqual({ deleted: true, id: 'question_1' })
  })

  it('manages job scoring criteria and analyze-all', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/jobs/job_1/criteria' && init?.method === 'GET') {
        return Response.json({ criteria: [{ key: 'typescript' }] })
      }
      if (url === 'https://careers.example.com/api/jobs/job_1/criteria' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ criteria: [{ key: 'typescript', name: 'TypeScript' }] })
        return Response.json({ criteria: [{ key: 'typescript', name: 'TypeScript' }] }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/jobs/job_1/criteria' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ weights: [{ key: 'typescript', weight: 80 }] })
        return Response.json({ criteria: [{ key: 'typescript', weight: 80 }] })
      }
      if (url === 'https://careers.example.com/api/jobs/job_1/criteria/generate' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ template: 'technical' })
        return Response.json({ criteria: [{ key: 'technical_depth' }], source: 'template' })
      }
      if (url === 'https://careers.example.com/api/jobs/job_1/analyze-all' && init?.method === 'POST') {
        return Response.json({ applicationIds: ['app_1'], total: 1 })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const listOut: string[] = []
    const replaceOut: string[] = []
    const weightsOut: string[] = []
    const generateOut: string[] = []
    const analyzeOut: string[] = []

    const listExit = await runCli(
      ['jobs', 'criteria', 'list', 'job_1', '--config', configPath, '--json'],
      { stdout: (value) => listOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const replaceExit = await runCli(
      ['jobs', 'criteria', 'replace', 'job_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => replaceOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ criteria: [{ key: 'typescript', name: 'TypeScript' }] }),
      },
    )
    const weightsExit = await runCli(
      ['jobs', 'criteria', 'update-weights', 'job_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => weightsOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ weights: [{ key: 'typescript', weight: 80 }] }),
      },
    )
    const generateExit = await runCli(
      ['jobs', 'criteria', 'generate', 'job_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => generateOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ template: 'technical' }),
      },
    )
    const analyzeExit = await runCli(
      ['jobs', 'analyze-all', 'job_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => analyzeOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(listExit).toBe(0)
    expect(replaceExit).toBe(0)
    expect(weightsExit).toBe(0)
    expect(generateExit).toBe(0)
    expect(analyzeExit).toBe(0)
    expect(JSON.parse(listOut[0])).toEqual({ criteria: [{ key: 'typescript' }] })
    expect(JSON.parse(replaceOut[0])).toEqual({ criteria: [{ key: 'typescript', name: 'TypeScript' }] })
    expect(JSON.parse(weightsOut[0])).toEqual({ criteria: [{ key: 'typescript', weight: 80 }] })
    expect(JSON.parse(generateOut[0])).toEqual({ criteria: [{ key: 'technical_depth' }], source: 'template' })
    expect(JSON.parse(analyzeOut[0])).toEqual({ applicationIds: ['app_1'], total: 1 })
  })
})
