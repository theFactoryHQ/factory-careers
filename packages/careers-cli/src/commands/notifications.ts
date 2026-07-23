import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'
import {
  cliApplicationNotificationPreferenceSchema,
  cliHiringInboxNotificationSettingsSchema,
} from '../schemas'

export function registerNotificationCommands(program: Command, runtime: CliRuntime): Command {
  const notifications = program
    .command('notifications')
    .description('Manage application email notifications')

  const personal = notifications
    .command('personal')
    .description('Manage your personal application notifications')

  registerJsonCommand(runtime, personal, {
    name: 'get',
    description: 'Get your personal application notification preference',
    method: 'GET',
    path: '/api/notification-preferences/application-email',
  })

  registerJsonCommand(runtime, personal, {
    name: 'set',
    description: 'Set your personal application notification preference from JSON',
    method: 'PUT',
    path: '/api/notification-preferences/application-email',
    mutation: true,
    stdin: true,
    schema: cliApplicationNotificationPreferenceSchema,
  })

  const inbox = notifications
    .command('inbox')
    .description('Manage the organization careers inbox notifications')

  registerJsonCommand(runtime, inbox, {
    name: 'get',
    description: 'Get the careers inbox application notification setting',
    method: 'GET',
    path: '/api/notification-settings/application-email',
  })

  registerJsonCommand(runtime, inbox, {
    name: 'set',
    description: 'Set the careers inbox application notification setting from JSON',
    method: 'PATCH',
    path: '/api/notification-settings/application-email',
    mutation: true,
    stdin: true,
    schema: cliHiringInboxNotificationSettingsSchema,
  })

  return notifications
}
