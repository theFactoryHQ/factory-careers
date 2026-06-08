import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerPublicCommands(program: Command, runtime: CliRuntime): Command {
  const publicCommands = program
    .command('public')
    .description('Use public careers endpoints')

  const publicJobs = publicCommands
    .command('jobs')
    .description('Use public job board endpoints')

  registerJsonCommand(runtime, publicJobs, {
    name: 'list',
    description: 'List public jobs',
    method: 'GET',
    path: '/api/public/jobs',
    requireAuth: false,
    options: [
      { flags: '--page <number>', description: 'Page number' },
      { flags: '--limit <number>', description: 'Page size' },
      { flags: '--search <query>', description: 'Search jobs by title or location' },
      { flags: '--type <type>', description: 'Filter by job type' },
      { flags: '--location <location>', description: 'Filter by location' },
    ],
    query: (options) => ({
      page: options.page as string | undefined,
      limit: options.limit as string | undefined,
      search: options.search as string | undefined,
      type: options.type as string | undefined,
      location: options.location as string | undefined,
    }),
  })

  registerJsonCommand(runtime, publicJobs, {
    name: 'get',
    description: 'Get a public job by slug',
    method: 'GET',
    path: (slug) => `/api/public/jobs/${encodeURIComponent(slug)}`,
    args: [{ name: 'slug', description: 'Public job slug' }],
    requireAuth: false,
  })

  registerJsonCommand(runtime, publicJobs, {
    name: 'apply',
    description: 'Submit a public application as JSON',
    method: 'POST',
    path: (slug) => `/api/public/jobs/${encodeURIComponent(slug)}/apply`,
    args: [{ name: 'slug', description: 'Public job slug' }],
    requireAuth: false,
    mutation: true,
    stdin: true,
  })

  return publicCommands
}