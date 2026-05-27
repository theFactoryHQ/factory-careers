import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-ai-config-'))
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

describe('CLI AI config commands', () => {
  it('lists and gets AI configurations', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/ai-config' && init?.method === 'GET') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        return Response.json([{ id: 'cfg_1', provider: 'openai', hasApiKey: true }])
      }
      if (url === 'https://careers.example.com/api/ai-config/cfg_1' && init?.method === 'GET') {
        return Response.json({ id: 'cfg_1', provider: 'openai', hasApiKey: true })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const listOut: string[] = []
    const getOut: string[] = []

    const listExit = await runCli(
      ['ai-config', 'list', '--config', configPath, '--json'],
      { stdout: (value) => listOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const getExit = await runCli(
      ['ai-config', 'get', 'cfg_1', '--config', configPath, '--json'],
      { stdout: (value) => getOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(listExit).toBe(0)
    expect(getExit).toBe(0)
    expect(JSON.parse(listOut[0])).toEqual([{ id: 'cfg_1', provider: 'openai', hasApiKey: true }])
    expect(JSON.parse(getOut[0])).toEqual({ id: 'cfg_1', provider: 'openai', hasApiKey: true })
  })

  it('creates, updates, sets defaults, tests, and deletes AI configurations', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/ai-config' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          name: 'OpenAI',
          provider: 'openai',
          model: 'gpt-5-mini',
          apiKey: 'sk-test',
        })
        return Response.json({ config: { id: 'cfg_1', name: 'OpenAI', hasApiKey: true } }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/ai-config/cfg_1' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ model: 'gpt-5' })
        return Response.json({ config: { id: 'cfg_1', model: 'gpt-5', hasApiKey: true } })
      }
      if (url === 'https://careers.example.com/api/ai-config/cfg_1/set-default' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ purposes: ['chatbot', 'analysis'] })
        return Response.json({ success: true })
      }
      if (url === 'https://careers.example.com/api/ai-config/cfg_1/test-connection' && init?.method === 'POST') {
        return Response.json({ success: true })
      }
      if (url === 'https://careers.example.com/api/ai-config/cfg_1' && init?.method === 'DELETE') {
        return Response.json({ success: true })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const createOut: string[] = []
    const updateOut: string[] = []
    const defaultOut: string[] = []
    const testOut: string[] = []
    const deleteOut: string[] = []

    const createExit = await runCli(
      ['ai-config', 'create', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => createOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({
          name: 'OpenAI',
          provider: 'openai',
          model: 'gpt-5-mini',
          apiKey: 'sk-test',
        }),
      },
    )
    const updateExit = await runCli(
      ['ai-config', 'update', 'cfg_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => updateOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ model: 'gpt-5' }),
      },
    )
    const defaultExit = await runCli(
      ['ai-config', 'set-default', 'cfg_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => defaultOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ purposes: ['chatbot', 'analysis'] }),
      },
    )
    const testExit = await runCli(
      ['ai-config', 'test-connection', 'cfg_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => testOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const deleteExit = await runCli(
      ['ai-config', 'delete', 'cfg_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => deleteOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(createExit).toBe(0)
    expect(updateExit).toBe(0)
    expect(defaultExit).toBe(0)
    expect(testExit).toBe(0)
    expect(deleteExit).toBe(0)
    expect(JSON.parse(createOut[0])).toEqual({ config: { id: 'cfg_1', name: 'OpenAI', hasApiKey: true } })
    expect(JSON.parse(updateOut[0])).toEqual({ config: { id: 'cfg_1', model: 'gpt-5', hasApiKey: true } })
    expect(JSON.parse(defaultOut[0])).toEqual({ success: true })
    expect(JSON.parse(testOut[0])).toEqual({ success: true })
    expect(JSON.parse(deleteOut[0])).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('lists providers, refreshes providers, and generates criteria', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/ai-config/providers' && init?.method === 'GET') {
        return Response.json({ openai: { models: [] } })
      }
      if (url === 'https://careers.example.com/api/ai-config/providers/refresh' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ provider: 'openai', force: true })
        return Response.json({ providers: { openai: { models: ['gpt-5'] } }, refreshedProviders: [] })
      }
      if (url === 'https://careers.example.com/api/ai-config/generate-criteria' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          title: 'Senior Engineer',
          description: 'Build durable systems.',
          aiConfigId: 'cfg_1',
        })
        return Response.json({ criteria: [{ key: 'systems_design' }], source: 'ai' })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const providersOut: string[] = []
    const refreshOut: string[] = []
    const criteriaOut: string[] = []

    const providersExit = await runCli(
      ['ai-config', 'providers', '--config', configPath, '--json'],
      { stdout: (value) => providersOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const refreshExit = await runCli(
      ['ai-config', 'refresh-providers', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => refreshOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ provider: 'openai', force: true }),
      },
    )
    const criteriaExit = await runCli(
      ['ai-config', 'generate-criteria', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => criteriaOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({
          title: 'Senior Engineer',
          description: 'Build durable systems.',
          aiConfigId: 'cfg_1',
        }),
      },
    )

    expect(providersExit).toBe(0)
    expect(refreshExit).toBe(0)
    expect(criteriaExit).toBe(0)
    expect(JSON.parse(providersOut[0])).toEqual({ openai: { models: [] } })
    expect(JSON.parse(refreshOut[0])).toEqual({ providers: { openai: { models: ['gpt-5'] } }, refreshedProviders: [] })
    expect(JSON.parse(criteriaOut[0])).toEqual({ criteria: [{ key: 'systems_design' }], source: 'ai' })
  })
})
