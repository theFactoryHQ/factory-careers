import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-chatbot-'))
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

describe('CLI chatbot commands', () => {
  it('uploads chatbot attachments as multipart form data', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    const contextPath = join(dir, 'context.txt')
    writeAuthedConfig(configPath)
    writeFileSync(contextPath, 'Candidate context for chatbot.')
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/chatbot/upload')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      expect(init?.headers).not.toHaveProperty('content-type')
      expect(init?.body).toBeInstanceOf(FormData)

      const form = init?.body as FormData
      const file = form.get('file')
      expect(file).toBeInstanceOf(Blob)
      expect((file as Blob & { name?: string }).name).toBe('context.txt')

      return Response.json({
        id: 'attachment_1',
        filename: 'context.txt',
        mimeType: 'text/plain',
        sizeBytes: 30,
        textLength: 28,
      })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['chatbot', 'upload', '--file', contextPath, '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({
      id: 'attachment_1',
      filename: 'context.txt',
      mimeType: 'text/plain',
      sizeBytes: 30,
      textLength: 28,
    })
  })

  it('manages chatbot conversations and sends chat prompts', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/chatbot/conversations' && init?.method === 'GET') {
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        return Response.json({ conversations: [{ id: 'conv_1', title: 'Hiring plan' }] })
      }
      if (url === 'https://careers.example.com/api/chatbot/conversations' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ title: 'Hiring plan', scope: { kind: 'organization' } })
        return Response.json({ conversation: { id: 'conv_1', title: 'Hiring plan' } }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/chatbot/conversations/conv_1' && init?.method === 'GET') {
        return Response.json({ conversation: { id: 'conv_1', messages: [] } })
      }
      if (url === 'https://careers.example.com/api/chatbot/conversations/conv_1' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ pinned: true })
        return Response.json({ conversation: { id: 'conv_1', pinned: true } })
      }
      if (url === 'https://careers.example.com/api/chatbot/chat' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          conversationId: 'conv_1',
          scope: { kind: 'organization' },
          messages: [{ role: 'user', content: 'Summarize open roles.', attachmentIds: ['att_1'] }],
        })
        return new Response('data: {"type":"conversation-meta","conversationId":"conv_1","title":"Summarize open roles."}\n\ndata: {"type":"text-delta","text":"Done"}\n\ndata: {"type":"finish","usage":{"promptTokens":1,"completionTokens":1}}\n\n', {
          headers: { 'content-type': 'text/event-stream' },
        })
      }
      if (url === 'https://careers.example.com/api/chatbot/conversations/conv_1' && init?.method === 'DELETE') {
        return Response.json({ success: true })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const listOut: string[] = []
    const createOut: string[] = []
    const getOut: string[] = []
    const updateOut: string[] = []
    const chatOut: string[] = []
    const deleteOut: string[] = []

    const listExit = await runCli(
      ['chatbot', 'conversations', 'list', '--config', configPath, '--json'],
      { stdout: (value) => listOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const createExit = await runCli(
      ['chatbot', 'conversations', 'create', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => createOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ title: 'Hiring plan', scope: { kind: 'organization' } }),
      },
    )
    const getExit = await runCli(
      ['chatbot', 'conversations', 'get', 'conv_1', '--config', configPath, '--json'],
      { stdout: (value) => getOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )
    const updateExit = await runCli(
      ['chatbot', 'conversations', 'update', 'conv_1', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => updateOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({ pinned: true }),
      },
    )
    const chatExit = await runCli(
      ['chatbot', 'chat', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: (value) => chatOut.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify({
          conversationId: 'conv_1',
          scope: { kind: 'organization' },
          messages: [{ role: 'user', content: 'Summarize open roles.', attachmentIds: ['att_1'] }],
        }),
      },
    )
    const deleteExit = await runCli(
      ['chatbot', 'conversations', 'delete', 'conv_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => deleteOut.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(listExit).toBe(0)
    expect(createExit).toBe(0)
    expect(getExit).toBe(0)
    expect(updateExit).toBe(0)
    expect(chatExit).toBe(0)
    expect(deleteExit).toBe(0)
    expect(JSON.parse(listOut[0])).toEqual({ conversations: [{ id: 'conv_1', title: 'Hiring plan' }] })
    expect(JSON.parse(createOut[0])).toEqual({ conversation: { id: 'conv_1', title: 'Hiring plan' } })
    expect(JSON.parse(getOut[0])).toEqual({ conversation: { id: 'conv_1', messages: [] } })
    expect(JSON.parse(updateOut[0])).toEqual({ conversation: { id: 'conv_1', pinned: true } })
    expect(JSON.parse(chatOut[0])).toEqual({
      events: [
        { type: 'conversation-meta', conversationId: 'conv_1', title: 'Summarize open roles.' },
        { type: 'text-delta', text: 'Done' },
        { type: 'finish', usage: { promptTokens: 1, completionTokens: 1 } },
      ],
      text: 'Done',
    })
    expect(JSON.parse(deleteOut[0])).toEqual({ success: true })
  })

  it('forwards a supported fifty-message chatbot context without changing the body', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const messages = Array.from({ length: 50 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index}`,
      ...(index === 48 ? { attachmentIds: ['att_1'] } : {}),
    }))
    const requestBody = {
      conversationId: 'conv_1',
      scope: { kind: 'organization' },
      messages,
    }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/chatbot/chat')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual(requestBody)
      return new Response('data: {"type":"finish"}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      })
    })

    const exitCode = await runCli(
      ['chatbot', 'chat', '--stdin', '--yes', '--config', configPath, '--json'],
      {
        stdout: () => {},
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: async () => JSON.stringify(requestBody),
      },
    )

    expect(exitCode).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('manages chatbot folders and agents', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/chatbot/folders' && init?.method === 'GET') {
        return Response.json({ folders: [{ id: 'folder_1', name: 'Plans' }] })
      }
      if (url === 'https://careers.example.com/api/chatbot/folders' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ name: 'Plans' })
        return Response.json({ folder: { id: 'folder_1', name: 'Plans' } }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/chatbot/folders/folder_1' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ position: 2 })
        return Response.json({ folder: { id: 'folder_1', position: 2 } })
      }
      if (url === 'https://careers.example.com/api/chatbot/folders/folder_1' && init?.method === 'DELETE') {
        return Response.json({ success: true })
      }
      if (url === 'https://careers.example.com/api/chatbot/agents' && init?.method === 'GET') {
        return Response.json({ agents: [{ id: 'agent_1', name: 'Sourcer' }] })
      }
      if (url === 'https://careers.example.com/api/chatbot/agents' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ name: 'Sourcer', systemPrompt: 'Find strong candidates.' })
        return Response.json({ agent: { id: 'agent_1', name: 'Sourcer' } }, { status: 201 })
      }
      if (url === 'https://careers.example.com/api/chatbot/agents/agent_1' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ isDefault: true })
        return Response.json({ agent: { id: 'agent_1', isDefault: true } })
      }
      if (url === 'https://careers.example.com/api/chatbot/agents/agent_1' && init?.method === 'DELETE') {
        return Response.json({ success: true })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    const outputs: string[] = []

    const calls: Array<[string[], string | undefined]> = [
      [['chatbot', 'folders', 'list', '--config', configPath, '--json'], undefined],
      [['chatbot', 'folders', 'create', '--stdin', '--yes', '--config', configPath, '--json'], JSON.stringify({ name: 'Plans' })],
      [['chatbot', 'folders', 'update', 'folder_1', '--stdin', '--yes', '--config', configPath, '--json'], JSON.stringify({ position: 2 })],
      [['chatbot', 'folders', 'delete', 'folder_1', '--yes', '--config', configPath, '--json'], undefined],
      [['chatbot', 'agents', 'list', '--config', configPath, '--json'], undefined],
      [['chatbot', 'agents', 'create', '--stdin', '--yes', '--config', configPath, '--json'], JSON.stringify({ name: 'Sourcer', systemPrompt: 'Find strong candidates.' })],
      [['chatbot', 'agents', 'update', 'agent_1', '--stdin', '--yes', '--config', configPath, '--json'], JSON.stringify({ isDefault: true })],
      [['chatbot', 'agents', 'delete', 'agent_1', '--yes', '--config', configPath, '--json'], undefined],
    ]

    for (const [argv, stdin] of calls) {
      const exitCode = await runCli(argv, {
        stdout: (value) => outputs.push(value),
        stderr: () => {},
        fetch: fetchMock as typeof fetch,
        stdin: stdin ? async () => stdin : undefined,
      })
      expect(exitCode).toBe(0)
    }

    expect(outputs.map(value => JSON.parse(value))).toEqual([
      { folders: [{ id: 'folder_1', name: 'Plans' }] },
      { folder: { id: 'folder_1', name: 'Plans' } },
      { folder: { id: 'folder_1', position: 2 } },
      { success: true },
      { agents: [{ id: 'agent_1', name: 'Sourcer' }] },
      { agent: { id: 'agent_1', name: 'Sourcer' } },
      { agent: { id: 'agent_1', isDefault: true } },
      { success: true },
    ])
  })
})
