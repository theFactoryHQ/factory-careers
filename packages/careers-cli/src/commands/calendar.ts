import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerCalendarCommands(program: Command, runtime: CliRuntime): Command {
  const calendar = program
    .command('calendar')
    .description('Manage calendar integrations')

  registerJsonCommand(runtime, calendar, {
    name: 'status',
    description: 'Show calendar integration status',
    method: 'GET',
    path: '/api/calendar/status',
  })

  runtime.addGlobalOptions(
    calendar
      .command('connect')
      .description('Print the provider connection URL')
      .argument('[provider]', 'Calendar provider: google or microsoft', 'google'),
  ).action((provider: string, options: Record<string, unknown>, command) => {
    const { globals, profile } = runtime.getContext(command, options)
    const normalizedProvider = provider === 'microsoft' ? 'microsoft' : 'google'
    runtime.outputResult(runtime.io, globals, {
      provider: normalizedProvider,
      url: `${profile.baseUrl}/api/calendar/${normalizedProvider}/connect`,
    })
  })

  registerJsonCommand(runtime, calendar, {
    name: 'disconnect',
    description: 'Disconnect calendar integration',
    method: 'POST',
    path: '/api/calendar/disconnect',
    mutation: true,
  })

  registerJsonCommand(runtime, calendar, {
    name: 'renew-webhooks',
    description: 'Renew expiring calendar webhooks',
    method: 'POST',
    path: '/api/calendar/renew-webhooks',
    mutation: true,
  })

  return calendar
}