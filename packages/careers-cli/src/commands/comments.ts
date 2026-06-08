import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerCommentsCommands(program: Command, runtime: CliRuntime): Command {
  const comments = program
    .command('comments')
    .description('Manage comments')

  registerJsonCommand(runtime, comments, {
    name: 'list',
    description: 'List comments for a target',
    method: 'GET',
    path: '/api/comments',
    options: [
      { flags: '--target-type <type>', description: 'Target type: candidate, application, or job', required: true },
      { flags: '--target-id <id>', description: 'Target ID', required: true },
      { flags: '--page <number>', description: 'Page number' },
      { flags: '--limit <number>', description: 'Page size' },
    ],
    requireOptions: [
      { key: 'targetType', flagName: '--target-type' },
      { key: 'targetId', flagName: '--target-id' },
    ],
    query: (options) => ({
      targetType: options.targetType as string,
      targetId: options.targetId as string,
      page: options.page as string | undefined,
      limit: options.limit as string | undefined,
    }),
  })

  registerJsonCommand(runtime, comments, {
    name: 'create',
    description: 'Create a comment',
    method: 'POST',
    path: '/api/comments',
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, comments, {
    name: 'update',
    description: 'Update a comment',
    method: 'PATCH',
    path: (id) => `/api/comments/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Comment ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, comments, {
    name: 'delete',
    description: 'Delete a comment',
    method: 'DELETE',
    path: (id) => `/api/comments/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Comment ID' }],
    mutation: true,
    deleteAck: true,
  })

  return comments
}