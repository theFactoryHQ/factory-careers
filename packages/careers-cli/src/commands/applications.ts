import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'
import { cliApplicationCreateSchema } from '../schemas'

export function registerApplicationsCommands(program: Command, runtime: CliRuntime): Command {
  const applications = program
    .command('applications')
    .description('Manage applications')

  registerJsonCommand(runtime, applications, {
    name: 'list',
    description: 'List applications',
    method: 'GET',
    path: '/api/applications',
    options: [
      { flags: '--page <number>', description: 'Page number' },
      { flags: '--limit <number>', description: 'Page size' },
      { flags: '--job-id <id>', description: 'Filter by job ID' },
      { flags: '--candidate-id <id>', description: 'Filter by candidate ID' },
      { flags: '--status <status>', description: 'Filter by pipeline status' },
      { flags: '--search <query>', description: 'Search application content, including resumes' },
    ],
    query: (options) => ({
      page: options.page as string | undefined,
      limit: options.limit as string | undefined,
      jobId: options.jobId as string | undefined,
      candidateId: options.candidateId as string | undefined,
      status: options.status as string | undefined,
      search: options.search as string | undefined,
    }),
  })

  registerJsonCommand(runtime, applications, {
    name: 'get',
    description: 'Get an application by ID',
    method: 'GET',
    path: (id) => `/api/applications/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Application ID' }],
  })

  registerJsonCommand(runtime, applications, {
    name: 'create',
    description: 'Create an application',
    method: 'POST',
    path: '/api/applications',
    mutation: true,
    stdin: true,
    schema: cliApplicationCreateSchema,
  })

  registerJsonCommand(runtime, applications, {
    name: 'update',
    description: 'Update an application',
    method: 'PATCH',
    path: (id) => `/api/applications/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Application ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, applications, {
    name: 'status',
    description: 'Update an application pipeline status',
    method: 'PATCH',
    path: (id) => `/api/applications/${encodeURIComponent(id)}`,
    args: [
      { name: 'id', description: 'Application ID' },
      { name: 'status', description: 'Pipeline status' },
    ],
    mutation: true,
    body: ({ args }) => ({ status: args[1] }),
  })

  registerJsonCommand(runtime, applications, {
    name: 'analyze',
    description: 'Run AI analysis for an application',
    method: 'POST',
    path: (id) => `/api/applications/${encodeURIComponent(id)}/analyze`,
    args: [{ name: 'id', description: 'Application ID' }],
    mutation: true,
  })

  registerJsonCommand(runtime, applications, {
    name: 'scores',
    description: 'Get application scores',
    method: 'GET',
    path: (id) => `/api/applications/${encodeURIComponent(id)}/scores`,
    args: [{ name: 'id', description: 'Application ID' }],
  })

  registerJsonCommand(runtime, applications, {
    name: 'set-property',
    description: 'Set an application custom property value',
    method: 'PUT',
    path: (applicationId, propertyId) =>
      `/api/applications/${encodeURIComponent(applicationId)}/properties/${encodeURIComponent(propertyId)}`,
    args: [
      { name: 'applicationId', description: 'Application ID' },
      { name: 'propertyId', description: 'Property definition ID' },
    ],
    mutation: true,
    stdin: true,
  })

  return applications
}
