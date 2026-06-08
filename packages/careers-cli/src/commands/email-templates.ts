import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerEmailTemplatesCommands(program: Command, runtime: CliRuntime): Command {
  const emailTemplates = program
    .command('email-templates')
    .description('Manage email templates')

  registerJsonCommand(runtime, emailTemplates, {
    name: 'list',
    description: 'List email templates',
    method: 'GET',
    path: '/api/email-templates',
  })

  registerJsonCommand(runtime, emailTemplates, {
    name: 'create',
    description: 'Create an email template',
    method: 'POST',
    path: '/api/email-templates',
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, emailTemplates, {
    name: 'update',
    description: 'Update an email template',
    method: 'PATCH',
    path: (id) => `/api/email-templates/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Email template ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, emailTemplates, {
    name: 'delete',
    description: 'Delete an email template',
    method: 'DELETE',
    path: (id) => `/api/email-templates/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Email template ID' }],
    mutation: true,
    deleteAck: true,
  })

  return emailTemplates
}