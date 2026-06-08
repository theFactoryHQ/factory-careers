import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerSystemCommands(program: Command, runtime: CliRuntime): Command {
  const system = program
    .command('system')
    .description('Read system diagnostics and update metadata')

  for (const commandConfig of [
    { name: 'info', path: 'system', description: 'Show system diagnostics' },
    { name: 'version', path: 'version', description: 'Show version and update status' },
    { name: 'changelog', path: 'changelog', description: 'Show structured changelog entries' },
  ] as const) {
    registerJsonCommand(runtime, system, {
      name: commandConfig.name,
      description: commandConfig.description,
      method: 'GET',
      path: `/api/updates/${commandConfig.path}`,
    })
  }

  registerJsonCommand(runtime, system, {
    name: 'capabilities',
    description: 'Show the authenticated CLI/API compatibility contract',
    method: 'GET',
    path: '/api/cli/capabilities',
  })

  return system
}