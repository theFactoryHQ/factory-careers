import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerAiConfigCommands(program: Command, runtime: CliRuntime): Command {
  const aiConfig = program
    .command('ai-config')
    .description('Manage AI provider configurations')

  registerJsonCommand(runtime, aiConfig, {
    name: 'list',
    description: 'List AI configurations',
    method: 'GET',
    path: '/api/ai-config',
  })

  registerJsonCommand(runtime, aiConfig, {
    name: 'get',
    description: 'Get an AI configuration',
    method: 'GET',
    path: (id) => `/api/ai-config/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'AI configuration ID' }],
  })

  registerJsonCommand(runtime, aiConfig, {
    name: 'create',
    description: 'Create an AI configuration',
    method: 'POST',
    path: '/api/ai-config',
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, aiConfig, {
    name: 'update',
    description: 'Update an AI configuration',
    method: 'PATCH',
    path: (id) => `/api/ai-config/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'AI configuration ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, aiConfig, {
    name: 'delete',
    description: 'Delete an AI configuration',
    method: 'DELETE',
    path: (id) => `/api/ai-config/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'AI configuration ID' }],
    mutation: true,
  })

  registerJsonCommand(runtime, aiConfig, {
    name: 'set-default',
    description: 'Set default AI configuration purpose slots',
    method: 'POST',
    path: (id) => `/api/ai-config/${encodeURIComponent(id)}/set-default`,
    args: [{ name: 'id', description: 'AI configuration ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, aiConfig, {
    name: 'test-connection',
    description: 'Test an AI configuration',
    method: 'POST',
    path: (id) => `/api/ai-config/${encodeURIComponent(id)}/test-connection`,
    args: [{ name: 'id', description: 'AI configuration ID' }],
    mutation: true,
  })

  registerJsonCommand(runtime, aiConfig, {
    name: 'providers',
    description: 'List supported AI providers and models',
    method: 'GET',
    path: '/api/ai-config/providers',
  })

  registerJsonCommand(runtime, aiConfig, {
    name: 'refresh-providers',
    description: 'Refresh provider model catalogs',
    method: 'POST',
    path: '/api/ai-config/providers/refresh',
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, aiConfig, {
    name: 'generate-criteria',
    description: 'Generate scoring criteria from a job description',
    method: 'POST',
    path: '/api/ai-config/generate-criteria',
    mutation: true,
    stdin: true,
  })

  return aiConfig
}