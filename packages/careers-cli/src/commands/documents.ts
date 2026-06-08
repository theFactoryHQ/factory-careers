import type { Command } from 'commander'
import { basename } from 'node:path'
import { readFileSync } from 'node:fs'
import { requestFormJson } from '../api'
import { registerBinaryDownload, registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

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

  registerJsonCommand(runtime, documents, {
    name: 'parse',
    description: 'Re-parse an existing document',
    method: 'POST',
    path: (id) => `/api/documents/${encodeURIComponent(id)}/parse`,
    args: [{ name: 'id', description: 'Document ID' }],
    mutation: true,
  })

  registerJsonCommand(runtime, documents, {
    name: 'parse-all',
    description: 'Re-parse all unparsed documents in the active organization',
    method: 'POST',
    path: '/api/documents/parse-all',
    mutation: true,
  })

  return documents
}