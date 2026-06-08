import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerFeedbackCommands(program: Command, runtime: CliRuntime): Command {
  const feedback = program
    .command('feedback')
    .description('Inspect and submit authenticated product feedback')

  registerJsonCommand(runtime, feedback, {
    name: 'status',
    description: 'Show whether feedback submission is configured',
    method: 'GET',
    path: '/api/feedback/config',
  })

  registerJsonCommand(runtime, feedback, {
    name: 'submit',
    description: 'Submit product feedback from stdin JSON',
    method: 'POST',
    path: '/api/feedback',
    mutation: true,
    stdin: true,
  })

  return feedback
}