import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerDashboardCommands(program: Command, runtime: CliRuntime): Command {
  const dashboard = program
    .command('dashboard')
    .description('Read dashboard and activity data')

  registerJsonCommand(runtime, dashboard, {
    name: 'summary',
    description: 'Show dashboard summary stats',
    method: 'GET',
    path: '/api/dashboard/stats',
  })

  registerJsonCommand(runtime, dashboard, {
    name: 'activity',
    description: 'List activity log entries',
    method: 'GET',
    path: '/api/activity-log',
    options: [
      { flags: '--page <number>', description: 'Page number' },
      { flags: '--limit <number>', description: 'Page size' },
      { flags: '--resource-type <type>', description: 'Filter by resource type' },
      { flags: '--resource-id <id>', description: 'Filter by resource ID' },
    ],
    query: (options) => ({
      page: options.page as string | undefined,
      limit: options.limit as string | undefined,
      resourceType: options.resourceType as string | undefined,
      resourceId: options.resourceId as string | undefined,
    }),
  })

  registerJsonCommand(runtime, dashboard, {
    name: 'timeline',
    description: 'Show enriched activity timeline',
    method: 'GET',
    path: '/api/activity-log/timeline',
    options: [
      { flags: '--before <datetime>', description: 'Fetch entries before this datetime' },
      { flags: '--after <datetime>', description: 'Fetch entries after this datetime' },
      { flags: '--limit <number>', description: 'Maximum entries to return' },
      { flags: '--resource-type <type>', description: 'Filter by resource type' },
    ],
    query: (options) => ({
      limit: options.limit as string | undefined,
      resourceType: options.resourceType as string | undefined,
      before: options.before as string | undefined,
      after: options.after as string | undefined,
    }),
  })

  registerJsonCommand(runtime, dashboard, {
    name: 'candidate-timeline',
    description: 'Show activity timeline for a candidate',
    method: 'GET',
    path: '/api/activity-log/candidate-timeline',
    args: [{ name: 'candidateId', description: 'Candidate ID' }],
    options: [
      { flags: '--limit <number>', description: 'Maximum entries to return' },
    ],
    query: (options, args) => ({
      candidateId: args[0],
      limit: options.limit as string | undefined,
    }),
  })

  registerJsonCommand(runtime, dashboard, {
    name: 'ai-stats',
    description: 'Show AI analysis usage stats',
    method: 'GET',
    path: '/api/ai-analysis/stats',
  })

  return dashboard
}