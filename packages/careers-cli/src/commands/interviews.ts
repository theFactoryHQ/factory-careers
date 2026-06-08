import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'
import { cliInterviewScheduleSchema } from '../schemas'

export function registerInterviewsCommands(program: Command, runtime: CliRuntime): Command {
  const interviews = program
    .command('interviews')
    .description('Manage interviews')

  registerJsonCommand(runtime, interviews, {
    name: 'list',
    description: 'List interviews',
    method: 'GET',
    path: '/api/interviews',
    options: [
      { flags: '--page <number>', description: 'Page number' },
      { flags: '--limit <number>', description: 'Page size' },
      { flags: '--application-id <id>', description: 'Filter by application ID' },
      { flags: '--job-id <id>', description: 'Filter by job ID' },
      { flags: '--status <status>', description: 'Filter by interview status' },
      { flags: '--from <datetime>', description: 'Inclusive start datetime' },
      { flags: '--to <datetime>', description: 'Inclusive end datetime' },
    ],
    query: (options) => ({
      page: options.page as string | undefined,
      limit: options.limit as string | undefined,
      applicationId: options.applicationId as string | undefined,
      jobId: options.jobId as string | undefined,
      status: options.status as string | undefined,
      from: options.from as string | undefined,
      to: options.to as string | undefined,
    }),
  })

  registerJsonCommand(runtime, interviews, {
    name: 'get',
    description: 'Get an interview by ID',
    method: 'GET',
    path: (id) => `/api/interviews/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Interview ID' }],
  })

  registerJsonCommand(runtime, interviews, {
    name: 'schedule',
    description: 'Schedule an interview',
    method: 'POST',
    path: '/api/interviews',
    mutation: true,
    stdin: true,
    schema: cliInterviewScheduleSchema,
  })

  registerJsonCommand(runtime, interviews, {
    name: 'update',
    description: 'Update an interview',
    method: 'PATCH',
    path: (id) => `/api/interviews/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Interview ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, interviews, {
    name: 'delete',
    description: 'Delete or cancel an interview',
    method: 'DELETE',
    path: (id) => `/api/interviews/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Interview ID' }],
    alias: 'cancel',
    mutation: true,
    deleteAck: true,
  })

  registerJsonCommand(runtime, interviews, {
    name: 'send-invitation',
    description: 'Send an interview invitation',
    method: 'POST',
    path: (id) => `/api/interviews/${encodeURIComponent(id)}/send-invitation`,
    args: [{ name: 'id', description: 'Interview ID' }],
    mutation: true,
    stdin: true,
  })

  return interviews
}