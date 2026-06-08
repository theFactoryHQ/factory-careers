import { Command } from 'commander'
import { addGlobalOptions, createCliRuntime, writeJson, type CliIo } from './cliRuntime'
import { registerAiConfigCommands } from './commands/ai-config'
import { registerApplicationsCommands } from './commands/applications'
import { registerAuthCommands } from './commands/auth'
import { registerCalendarCommands } from './commands/calendar'
import { registerCandidatesCommands } from './commands/candidates'
import { registerChatbotCommands } from './commands/chatbot'
import { registerCommentsCommands } from './commands/comments'
import { registerDashboardCommands } from './commands/dashboard'
import { registerDocumentsCommands } from './commands/documents'
import { registerEmailTemplatesCommands } from './commands/email-templates'
import { registerFeedbackCommands } from './commands/feedback'
import { registerInterviewsCommands } from './commands/interviews'
import { registerJobsCommands } from './commands/jobs'
import { registerOrgCommands } from './commands/org'
import { registerPropertiesCommands } from './commands/properties'
import { registerPublicCommands } from './commands/public'
import { registerSourceTrackingCommands } from './commands/source-tracking'
import { registerSystemCommands } from './commands/system'
import { normalizeCliError } from './errors'

export function createProgram(io: CliIo = {}): Command {
  const runtime = createCliRuntime(io)
  const program = addGlobalOptions(new Command())
    .name('factory-careers')
    .description('Authenticated CLI for Factory Careers')
    .exitOverride()
    .configureOutput({
      writeOut: (value) => io.stdout?.(value.trimEnd()),
      writeErr: (value) => io.stderr?.(value.trimEnd()),
    })

  registerAuthCommands(program, runtime)
  registerJobsCommands(program, runtime)
  registerCandidatesCommands(program, runtime)
  registerDocumentsCommands(program, runtime)
  registerCommentsCommands(program, runtime)
  registerEmailTemplatesCommands(program, runtime)
  registerPropertiesCommands(program, runtime)
  registerFeedbackCommands(program, runtime)
  registerSourceTrackingCommands(program, runtime)
  registerSystemCommands(program, runtime)
  registerInterviewsCommands(program, runtime)
  registerOrgCommands(program, runtime)
  registerCalendarCommands(program, runtime)
  registerDashboardCommands(program, runtime)
  registerAiConfigCommands(program, runtime)
  registerChatbotCommands(program, runtime)
  registerPublicCommands(program, runtime)
  registerApplicationsCommands(program, runtime)

  return program
}

export async function runCli(argv: string[], io: CliIo = {
  stdout: (value) => console.log(value),
  stderr: (value) => console.error(value),
}): Promise<number> {
  const program = createProgram(io)
  const wantsJson = argv.includes('--json')

  try {
    await program.parseAsync(argv, { from: 'user' })
    return 0
  } catch (err) {
    if (err && typeof err === 'object' && (err as { code?: unknown }).code === 'commander.helpDisplayed') {
      return 0
    }

    const normalized = normalizeCliError(err)

    if (wantsJson) {
      writeJson(io, normalized)
    } else {
      io.stderr?.(`${normalized.code}: ${normalized.message}`)
    }

    return normalized.status >= 400 ? 1 : normalized.status || 1
  }
}