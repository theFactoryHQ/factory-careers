import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerRecoveryCommands(program: Command, runtime: CliRuntime): Command {
  const recovery = program
    .command('recovery')
    .description('Operate encrypted application intake recovery receipts')

  registerJsonCommand(runtime, recovery, {
    name: 'list',
    description: 'List metadata for recoverable application receipts',
    method: 'GET',
    path: '/api/application-intake-recovery',
  })
  registerJsonCommand(runtime, recovery, {
    name: 'status',
    description: 'Show metadata for one recovery receipt',
    method: 'GET',
    path: receiptId => `/api/application-intake-recovery/${encodeURIComponent(receiptId)}`,
    args: [{ name: 'receiptId', description: 'Recovery receipt ID' }],
  })
  registerJsonCommand(runtime, recovery, {
    name: 'replay',
    description: 'Replay one recovery receipt through the normal application workflow',
    method: 'POST',
    path: receiptId => `/api/application-intake-recovery/${encodeURIComponent(receiptId)}/replay`,
    args: [{ name: 'receiptId', description: 'Recovery receipt ID' }],
    mutation: true,
  })
  registerJsonCommand(runtime, recovery, {
    name: 'purge',
    description: 'Purge expired recovery receipts',
    method: 'POST',
    path: '/api/application-intake-recovery/purge',
    mutation: true,
  })
  return recovery
}
