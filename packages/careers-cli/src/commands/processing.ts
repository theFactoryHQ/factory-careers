import type { Command } from 'commander'
import type { CliRuntime } from '../cliRuntime'
import {
  addProcessingWaitOptions,
  executeProcessingBatch,
  exitForUnsuccessfulBatch,
  getProcessingBatch,
  resolveProcessingWaitOptions,
  type ProcessingWaitCommandOptions,
} from '../processing'

export function registerProcessingCommands(program: Command, runtime: CliRuntime): Command {
  const processing = program
    .command('processing')
    .description('Inspect and resume durable processing batches')

  runtime.addGlobalOptions(
    processing
      .command('get')
      .description('Get a processing batch by ID')
      .argument('<batchId>', 'Processing batch ID'),
  ).action(async (batchId: string, options: Record<string, unknown>, command: Command) => {
    const { globals, profile } = runtime.getContext(command, options)
    const token = runtime.requireAuthenticatedProfile(profile)
    const result = await getProcessingBatch({
      fetch: runtime.getFetch(runtime.io),
      baseUrl: profile.baseUrl,
      token,
    }, batchId)
    runtime.outputResult(runtime.io, globals, result)
  })

  const drain = processing
    .command('drain')
    .description('Resume a processing batch and wait for terminal status')
    .argument('<batchId>', 'Processing batch ID')
  addProcessingWaitOptions(drain, false)
  runtime.addGlobalOptions(drain).action(async (
    batchId: string,
    options: ProcessingWaitCommandOptions,
    command: Command,
  ) => {
    const { globals, profile } = runtime.getContext(command, options)
    runtime.requireMutationConfirmation(globals)
    const token = runtime.requireAuthenticatedProfile(profile)
    const context = {
      fetch: runtime.getFetch(runtime.io),
      baseUrl: profile.baseUrl,
      token,
    }
    const result = await executeProcessingBatch(
      signal => getProcessingBatch(context, batchId, signal),
      {
        ...context,
        sleep: runtime.getSleep(runtime.io),
        options: resolveProcessingWaitOptions(options),
        timeoutBatchId: batchId,
      },
    )
    runtime.outputResult(runtime.io, globals, result)
    exitForUnsuccessfulBatch(result)
  })

  return processing
}
