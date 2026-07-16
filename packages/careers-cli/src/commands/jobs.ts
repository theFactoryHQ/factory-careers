import type { Command } from 'commander'
import { requestJson } from '../api'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'
import {
  addProcessingWaitOptions,
  executeProcessingBatch,
  exitForUnsuccessfulBatch,
  resolveProcessingWaitOptions,
  type ProcessingWaitCommandOptions,
} from '../processing'
import { cliJobCreateSchema } from '../schemas'

export function registerJobsCommands(program: Command, runtime: CliRuntime): Command {
  const jobs = program
    .command('jobs')
    .description('Manage jobs')

  registerJsonCommand(runtime, jobs, {
    name: 'list',
    description: 'List jobs',
    method: 'GET',
    path: '/api/jobs',
  })

  registerJsonCommand(runtime, jobs, {
    name: 'get',
    description: 'Get a job by ID',
    method: 'GET',
    path: (id) => `/api/jobs/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Job ID' }],
  })

  registerJsonCommand(runtime, jobs, {
    name: 'create',
    description: 'Create a job',
    method: 'POST',
    path: '/api/jobs',
    mutation: true,
    stdin: true,
    schema: cliJobCreateSchema,
  })

  registerJsonCommand(runtime, jobs, {
    name: 'update',
    description: 'Update a job',
    method: 'PATCH',
    path: (id) => `/api/jobs/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Job ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, jobs, {
    name: 'delete',
    description: 'Delete a job',
    method: 'DELETE',
    path: (id) => `/api/jobs/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Job ID' }],
    mutation: true,
  })

  for (const [commandName, status] of [
    ['open', 'open'],
    ['close', 'closed'],
    ['archive', 'archived'],
  ] as const) {
    registerJsonCommand(runtime, jobs, {
      name: commandName,
      description: `${commandName[0]?.toUpperCase()}${commandName.slice(1)} a job`,
      method: 'PATCH',
      path: (id) => `/api/jobs/${encodeURIComponent(id)}`,
      args: [{ name: 'id', description: 'Job ID' }],
      mutation: true,
      body: () => ({ status }),
    })
  }

  registerJsonCommand(runtime, jobs, {
    name: 'pipeline',
    description: 'List a bounded page of job pipeline applications',
    method: 'GET',
    path: id => `/api/jobs/${encodeURIComponent(id)}/pipeline`,
    args: [{ name: 'id', description: 'Job ID' }],
    options: [
      { flags: '--page <number>', description: 'Page number' },
      { flags: '--limit <number>', description: 'Page size (maximum 50)' },
      { flags: '--stage <status>', description: 'Pipeline stage' },
      { flags: '--search <query>', description: 'Search full application content' },
      { flags: '--candidate-search <query>', description: 'Search candidate name or email' },
      { flags: '--score <filter>', description: 'Score filter: all, high, medium, low, or none' },
      { flags: '--interviews <filter>', description: 'Interview filter: all, has-interview, or no-interview' },
      { flags: '--sort <order>', description: 'Pipeline sort order' },
      { flags: '--property-filters <json>', description: 'JSON-encoded custom property filters' },
    ],
    query: options => ({
      page: options.page as string | undefined,
      limit: options.limit as string | undefined,
      stage: options.stage as string | undefined,
      search: options.search as string | undefined,
      candidateSearch: options.candidateSearch as string | undefined,
      score: options.score as string | undefined,
      interviews: options.interviews as string | undefined,
      sort: options.sort as string | undefined,
      propertyFilters: options.propertyFilters as string | undefined,
    }),
  })

  const analyzeAll = jobs
    .command('analyze-all')
    .description('Score every currently unscored application on a job')
    .argument('<id>', 'Job ID')
  addProcessingWaitOptions(analyzeAll)
  runtime.addGlobalOptions(analyzeAll).action(async (
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
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(id)}/analyze-all`,
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

  const jobQuestions = jobs
    .command('questions')
    .description('Manage job application questions')

  registerJsonCommand(runtime, jobQuestions, {
    name: 'list',
    description: 'List job questions',
    method: 'GET',
    path: (jobId) => `/api/jobs/${encodeURIComponent(jobId)}/questions`,
    args: [{ name: 'jobId', description: 'Job ID' }],
  })

  registerJsonCommand(runtime, jobQuestions, {
    name: 'create',
    description: 'Create a job question',
    method: 'POST',
    path: (jobId) => `/api/jobs/${encodeURIComponent(jobId)}/questions`,
    args: [{ name: 'jobId', description: 'Job ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, jobQuestions, {
    name: 'update',
    description: 'Update a job question',
    method: 'PATCH',
    path: (jobId, questionId) =>
      `/api/jobs/${encodeURIComponent(jobId)}/questions/${encodeURIComponent(questionId)}`,
    args: [
      { name: 'jobId', description: 'Job ID' },
      { name: 'questionId', description: 'Question ID' },
    ],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, jobQuestions, {
    name: 'delete',
    description: 'Delete a job question',
    method: 'DELETE',
    path: (jobId, questionId) =>
      `/api/jobs/${encodeURIComponent(jobId)}/questions/${encodeURIComponent(questionId)}`,
    args: [
      { name: 'jobId', description: 'Job ID' },
      { name: 'questionId', description: 'Question ID' },
    ],
    mutation: true,
    formatResult: ({ args }) => ({ deleted: true, id: args[1] }),
  })

  registerJsonCommand(runtime, jobQuestions, {
    name: 'reorder',
    description: 'Reorder job questions',
    method: 'PUT',
    path: (jobId) => `/api/jobs/${encodeURIComponent(jobId)}/questions/reorder`,
    args: [{ name: 'jobId', description: 'Job ID' }],
    mutation: true,
    stdin: true,
  })

  const jobCriteria = jobs
    .command('criteria')
    .description('Manage job scoring criteria')

  registerJsonCommand(runtime, jobCriteria, {
    name: 'list',
    description: 'List job scoring criteria',
    method: 'GET',
    path: (jobId) => `/api/jobs/${encodeURIComponent(jobId)}/criteria`,
    args: [{ name: 'jobId', description: 'Job ID' }],
  })

  registerJsonCommand(runtime, jobCriteria, {
    name: 'replace',
    description: 'Replace job scoring criteria',
    method: 'POST',
    path: (jobId) => `/api/jobs/${encodeURIComponent(jobId)}/criteria`,
    args: [{ name: 'jobId', description: 'Job ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, jobCriteria, {
    name: 'update-weights',
    description: 'Update job scoring criterion weights',
    method: 'PATCH',
    path: (jobId) => `/api/jobs/${encodeURIComponent(jobId)}/criteria`,
    args: [{ name: 'jobId', description: 'Job ID' }],
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, jobCriteria, {
    name: 'generate',
    description: 'Generate job scoring criteria',
    method: 'POST',
    path: (jobId) => `/api/jobs/${encodeURIComponent(jobId)}/criteria/generate`,
    args: [{ name: 'jobId', description: 'Job ID' }],
    mutation: true,
    stdin: true,
  })

  return jobs
}
