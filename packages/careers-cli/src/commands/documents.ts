import type { Command } from 'commander'
import { basename } from 'node:path'
import { readFileSync } from 'node:fs'
import { requestFormJson, requestJson } from '../api'
import { registerBinaryDownload, registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'
import {
  addProcessingWaitOptions,
  executeProcessingBatch,
  exitForUnsuccessfulBatch,
  resolveProcessingWaitOptions,
  type ProcessingWaitCommandOptions,
} from '../processing'

type CandidateDocumentsResponse = {
  documents?: unknown[]
}

export function registerDocumentsCommands(program: Command, runtime: CliRuntime): Command {
  const documents = program
    .command('documents')
    .description('Manage candidate documents')

  registerJsonCommand(runtime, documents, {
    name: 'list',
    description: 'List documents attached to a candidate',
    method: 'GET',
    path: (candidateId) => `/api/candidates/${encodeURIComponent(candidateId)}`,
    args: [{ name: 'candidateId', description: 'Candidate ID' }],
    formatResult: ({ args, result }) => {
      const candidate = result as CandidateDocumentsResponse
      return {
        candidateId: args[0],
        documents: Array.isArray(candidate.documents) ? candidate.documents : [],
      }
    },
  })

  runtime.addGlobalOptions(
    documents
      .command('upload')
      .description('Upload a document for a candidate')
      .argument('<candidateId>', 'Candidate ID')
      .requiredOption('--file <path>', 'Path to the document file')
      .option('--type <type>', 'Document type: resume, cover_letter, or other', 'resume'),
  ).action(async (candidateId: string, options: Record<string, unknown>, command) => {
    const { globals, profile } = runtime.getContext(command, options)
    runtime.requireMutationConfirmation(globals)
    const token = runtime.requireAuthenticatedProfile(profile)
    const filePath = runtime.requireOption(options.file as string | undefined, '--file')
    const documentType = (options.type as string | undefined) ?? 'resume'
    const file = readFileSync(filePath)
    const form = new FormData()
    form.append('type', documentType)
    form.append('file', new Blob([file]), basename(filePath))

    const result = await requestFormJson<unknown>({
      fetch: runtime.getFetch(runtime.io),
      url: `${profile.baseUrl}/api/candidates/${encodeURIComponent(candidateId)}/documents`,
      token,
      form,
    })

    runtime.outputResult(runtime.io, globals, result)
  })

  registerBinaryDownload(runtime, documents, {
    name: 'download',
    description: 'Download a document',
    arg: { name: 'id', description: 'Document ID' },
    outputOption: { flags: '--output <path>', description: 'Path where the downloaded document should be written' },
    path: (id) => `/api/documents/${encodeURIComponent(id)}/download`,
  })

  registerBinaryDownload(runtime, documents, {
    name: 'preview',
    description: 'Download a same-origin PDF preview stream',
    arg: { name: 'id', description: 'Document ID' },
    outputOption: { flags: '--output <path>', description: 'Path where the preview PDF should be written' },
    path: (id) => `/api/documents/${encodeURIComponent(id)}/preview`,
  })

  registerJsonCommand(runtime, documents, {
    name: 'delete',
    description: 'Delete a document',
    method: 'DELETE',
    path: (id) => `/api/documents/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Document ID' }],
    mutation: true,
    deleteAck: true,
  })

  const parse = documents
    .command('parse')
    .description('Re-process an existing document')
    .argument('<id>', 'Document ID')
  addProcessingWaitOptions(parse)
  runtime.addGlobalOptions(parse).action(async (
    id: string,
    options: ProcessingWaitCommandOptions,
    command: Command,
  ) => {
    const { globals, profile } = runtime.getContext(command, options)
    runtime.requireMutationConfirmation(globals)
    const token = runtime.requireAuthenticatedProfile(profile)
    const fetchImpl = runtime.getFetch(runtime.io)
    const result = await executeProcessingBatch(signal => requestJson<unknown>({
      fetch: fetchImpl,
      url: `${profile.baseUrl}/api/documents/${encodeURIComponent(id)}/parse`,
      method: 'POST',
      token,
      signal,
    }), {
      fetch: fetchImpl,
      baseUrl: profile.baseUrl,
      token,
      sleep: runtime.getSleep(runtime.io),
      options: resolveProcessingWaitOptions(options),
    })
    runtime.outputResult(runtime.io, globals, result)
    exitForUnsuccessfulBatch(result)
  })

  const parseAll = documents
    .command('parse-all')
    .description('Re-process all pending documents in the active organization')
  addProcessingWaitOptions(parseAll)
  runtime.addGlobalOptions(parseAll).action(async (
    options: ProcessingWaitCommandOptions,
    command: Command,
  ) => {
    const { globals, profile } = runtime.getContext(command, options)
    runtime.requireMutationConfirmation(globals)
    const token = runtime.requireAuthenticatedProfile(profile)
    const fetchImpl = runtime.getFetch(runtime.io)
    const result = await executeProcessingBatch(signal => requestJson<unknown>({
      fetch: fetchImpl,
      url: `${profile.baseUrl}/api/documents/parse-all`,
      method: 'POST',
      token,
      signal,
    }), {
      fetch: fetchImpl,
      baseUrl: profile.baseUrl,
      token,
      sleep: runtime.getSleep(runtime.io),
      options: resolveProcessingWaitOptions(options),
    })
    runtime.outputResult(runtime.io, globals, result)
    exitForUnsuccessfulBatch(result)
  })

  return documents
}
