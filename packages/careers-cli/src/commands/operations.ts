import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerOperationsCommands(program: Command, runtime: CliRuntime): Command {
  const operations = program.command('operations').description('Run instance-level operations')
  const erasure = operations.command('document-erasure').description('Inspect and drain private-document erasure')

  registerJsonCommand(runtime, erasure, {
    name: 'status',
    description: 'Show aggregate document-erasure status',
    method: 'GET',
    path: '/api/operations/document-erasure',
  })
  registerJsonCommand(runtime, erasure, {
    name: 'drain',
    description: 'Run one bounded document-erasure cycle',
    method: 'POST',
    path: '/api/operations/document-erasure/drain',
    mutation: true,
    options: [{ flags: '--limit <number>', description: 'Maximum tombstones to claim' }],
    body: ({ options }) => ({
      confirm: true,
      limit: options.limit === undefined ? 10 : Number(options.limit),
    }),
  })
  return operations
}
