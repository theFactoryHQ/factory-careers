import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'
import { cliCandidateCreateSchema } from '../schemas'

export function registerCandidatesCommands(program: Command, runtime: CliRuntime): Command {
  const candidates = program
    .command('candidates')
    .description('Manage candidates')

  registerJsonCommand(runtime, candidates, {
    name: 'list',
    description: 'List candidates',
    method: 'GET',
    path: '/api/candidates',
  })

  registerJsonCommand(runtime, candidates, {
    name: 'get',
    description: 'Get a candidate by ID',
    method: 'GET',
    path: (id) => `/api/candidates/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Candidate ID' }],
  })

  registerJsonCommand(runtime, candidates, {
    name: 'create',
    description: 'Create a candidate',
    method: 'POST',
    path: '/api/candidates',
    mutation: true,
    stdin: true,
    schema: cliCandidateCreateSchema,
  })

  registerJsonCommand(runtime, candidates, {
    name: 'update',
    description: 'Update a candidate',
    method: 'PATCH',
    path: (id) => `/api/candidates/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Candidate ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, candidates, {
    name: 'delete',
    description: 'Delete a candidate',
    method: 'DELETE',
    path: (id) => `/api/candidates/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Candidate ID' }],
    mutation: true,
  })

  registerJsonCommand(runtime, candidates, {
    name: 'set-property',
    description: 'Set a candidate custom property value',
    method: 'PUT',
    path: (candidateId, propertyId) =>
      `/api/candidates/${encodeURIComponent(candidateId)}/properties/${encodeURIComponent(propertyId)}`,
    args: [
      { name: 'candidateId', description: 'Candidate ID' },
      { name: 'propertyId', description: 'Property definition ID' },
    ],
    mutation: true,
    stdin: true,
  })

  return candidates
}