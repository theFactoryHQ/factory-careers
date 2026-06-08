import type { Command } from 'commander'
import { basename } from 'node:path'
import { readFileSync } from 'node:fs'
import { requestFormJson, requestText } from '../api'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

function parseChatbotStream(value: string): { events: unknown[], text: string } {
  const events: unknown[] = []
  let text = ''

  for (const block of value.split(/\n\n+/)) {
    const data = block
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
      .trim()

    if (!data || data === '[DONE]') continue

    try {
      const event = JSON.parse(data) as { type?: unknown, text?: unknown }
      events.push(event)
      if (event.type === 'text-delta' && typeof event.text === 'string') {
        text += event.text
      }
    } catch {
      events.push({ type: 'raw', data })
    }
  }

  return { events, text }
}

function registerChatbotResourceCommands(
  runtime: CliRuntime,
  parent: Command,
  resource: { name: string, path: string, singular: string },
): void {
  registerJsonCommand(runtime, parent, {
    name: 'list',
    description: `List chatbot ${resource.name}`,
    method: 'GET',
    path: `/api/chatbot/${resource.path}`,
  })

  registerJsonCommand(runtime, parent, {
    name: 'create',
    description: `Create a chatbot ${resource.singular}`,
    method: 'POST',
    path: `/api/chatbot/${resource.path}`,
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, parent, {
    name: 'update',
    description: `Update a chatbot ${resource.singular}`,
    method: 'PATCH',
    path: (id) => `/api/chatbot/${resource.path}/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: `${resource.singular} ID` }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, parent, {
    name: 'delete',
    description: `Delete a chatbot ${resource.singular}`,
    method: 'DELETE',
    path: (id) => `/api/chatbot/${resource.path}/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: `${resource.singular} ID` }],
    mutation: true,
  })
}

export function registerChatbotCommands(program: Command, runtime: CliRuntime): Command {
  const chatbot = program
    .command('chatbot')
    .description('Manage chatbot conversations, folders, agents, and prompts')

  runtime.addGlobalOptions(
    chatbot
      .command('upload')
      .description('Upload a chatbot attachment')
      .requiredOption('--file <path>', 'Path to the attachment file'),
  ).action(async (options: Record<string, unknown>, command) => {
    const { globals, profile } = runtime.getContext(command, options)
    runtime.requireMutationConfirmation(globals)
    const token = runtime.requireAuthenticatedProfile(profile)
    const filePath = runtime.requireOption(options.file as string | undefined, '--file')
    const file = readFileSync(filePath)
    const form = new FormData()
    form.append('file', new Blob([file]), basename(filePath))

    const result = await requestFormJson<unknown>({
      fetch: runtime.getFetch(runtime.io),
      url: `${profile.baseUrl}/api/chatbot/upload`,
      token,
      form,
    })

    runtime.outputResult(runtime.io, globals, result)
  })

  const chatbotConversations = chatbot
    .command('conversations')
    .description('Manage chatbot conversations')

  registerJsonCommand(runtime, chatbotConversations, {
    name: 'list',
    description: 'List chatbot conversations',
    method: 'GET',
    path: '/api/chatbot/conversations',
  })

  registerJsonCommand(runtime, chatbotConversations, {
    name: 'create',
    description: 'Create a chatbot conversation',
    method: 'POST',
    path: '/api/chatbot/conversations',
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, chatbotConversations, {
    name: 'get',
    description: 'Get a chatbot conversation',
    method: 'GET',
    path: (id) => `/api/chatbot/conversations/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Conversation ID' }],
  })

  registerJsonCommand(runtime, chatbotConversations, {
    name: 'update',
    description: 'Update a chatbot conversation',
    method: 'PATCH',
    path: (id) => `/api/chatbot/conversations/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Conversation ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, chatbotConversations, {
    name: 'delete',
    description: 'Delete a chatbot conversation',
    method: 'DELETE',
    path: (id) => `/api/chatbot/conversations/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Conversation ID' }],
    mutation: true,
  })

  registerChatbotResourceCommands(runtime, chatbot.command('folders').description('Manage chatbot folders'), {
    name: 'folders',
    path: 'folders',
    singular: 'folder',
  })

  registerChatbotResourceCommands(runtime, chatbot.command('agents').description('Manage chatbot agents'), {
    name: 'agents',
    path: 'agents',
    singular: 'agent',
  })

  runtime.addGlobalOptions(
    chatbot
      .command('chat')
      .description('Send a chatbot prompt and collect streamed events')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: Record<string, unknown>, command) => {
    const { globals, profile } = runtime.getContext(command, options)
    runtime.requireMutationConfirmation(globals)
    const token = runtime.requireAuthenticatedProfile(profile)
    const body = await runtime.readStdinJson(runtime.io, options.stdin as boolean | undefined)
    const stream = await requestText({
      fetch: runtime.getFetch(runtime.io),
      url: `${profile.baseUrl}/api/chatbot/chat`,
      method: 'POST',
      token,
      body,
    })

    runtime.outputResult(runtime.io, globals, parseChatbotStream(stream))
  })

  return chatbot
}