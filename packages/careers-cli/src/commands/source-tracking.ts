import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerSourceTrackingCommands(program: Command, runtime: CliRuntime): Command {
  const sourceTracking = program
    .command('source-tracking')
    .description('Manage source tracking links and analytics')

  registerJsonCommand(runtime, sourceTracking, {
    name: 'list',
    description: 'List tracking links',
    method: 'GET',
    path: '/api/tracking-links',
    options: [
      { flags: '--page <number>', description: 'Page number' },
      { flags: '--limit <number>', description: 'Page size' },
      { flags: '--job-id <id>', description: 'Filter by job ID' },
      { flags: '--channel <channel>', description: 'Filter by source channel' },
      { flags: '--active <true|false>', description: 'Filter by active state' },
    ],
    query: (options) => ({
      page: options.page as string | undefined,
      limit: options.limit as string | undefined,
      jobId: options.jobId as string | undefined,
      channel: options.channel as string | undefined,
      isActive: options.active as string | undefined,
    }),
  })

  registerJsonCommand(runtime, sourceTracking, {
    name: 'get',
    description: 'Get a tracking link',
    method: 'GET',
    path: (id) => `/api/tracking-links/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Tracking link ID' }],
  })

  registerJsonCommand(runtime, sourceTracking, {
    name: 'create',
    description: 'Create a tracking link',
    method: 'POST',
    path: '/api/tracking-links',
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, sourceTracking, {
    name: 'update',
    description: 'Update a tracking link',
    method: 'PATCH',
    path: (id) => `/api/tracking-links/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Tracking link ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, sourceTracking, {
    name: 'delete',
    description: 'Delete a tracking link',
    method: 'DELETE',
    path: (id) => `/api/tracking-links/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Tracking link ID' }],
    mutation: true,
    deleteAck: true,
  })

  registerJsonCommand(runtime, sourceTracking, {
    name: 'link-stats',
    description: 'Show stats for a tracking link',
    method: 'GET',
    path: (id) => `/api/tracking-links/${encodeURIComponent(id)}/stats`,
    args: [{ name: 'id', description: 'Tracking link ID' }],
    options: [
      { flags: '--from <datetime>', description: 'Inclusive start datetime' },
      { flags: '--to <datetime>', description: 'Inclusive end datetime' },
    ],
    query: (options) => ({
      from: options.from as string | undefined,
      to: options.to as string | undefined,
    }),
  })

  registerJsonCommand(runtime, sourceTracking, {
    name: 'stats',
    description: 'Show source tracking stats',
    method: 'GET',
    path: '/api/source-tracking/stats',
    options: [
      { flags: '--job-id <id>', description: 'Filter by job ID' },
      { flags: '--from <datetime>', description: 'Inclusive start datetime' },
      { flags: '--to <datetime>', description: 'Inclusive end datetime' },
    ],
    query: (options) => ({
      jobId: options.jobId as string | undefined,
      from: options.from as string | undefined,
      to: options.to as string | undefined,
    }),
  })

  return sourceTracking
}