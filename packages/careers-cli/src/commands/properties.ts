import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerPropertiesCommands(program: Command, runtime: CliRuntime): Command {
  const properties = program
    .command('properties')
    .description('Manage custom properties')

  registerJsonCommand(runtime, properties, {
    name: 'list',
    description: 'List property definitions',
    method: 'GET',
    path: '/api/properties',
    options: [
      { flags: '--entity-type <type>', description: 'Entity type: candidate or application' },
      { flags: '--job-id <id>', description: 'Job ID for application properties' },
      { flags: '--job-only', description: 'Only return job-scoped application properties' },
    ],
    query: (options) => ({
      entityType: options.entityType as string | undefined,
      jobId: options.jobId as string | undefined,
      jobOnly: options.jobOnly as boolean | undefined,
    }),
  })

  registerJsonCommand(runtime, properties, {
    name: 'create',
    description: 'Create a property definition',
    method: 'POST',
    path: '/api/properties',
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, properties, {
    name: 'update',
    description: 'Update a property definition',
    method: 'PATCH',
    path: (id) => `/api/properties/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Property definition ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, properties, {
    name: 'delete',
    description: 'Delete a property definition',
    method: 'DELETE',
    path: (id) => `/api/properties/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Property definition ID' }],
    mutation: true,
    deleteAck: true,
  })

  registerJsonCommand(runtime, properties, {
    name: 'reorder',
    description: 'Reorder property definitions',
    method: 'POST',
    path: '/api/properties/reorder',
    mutation: true,
    stdin: true,
  })

  return properties
}