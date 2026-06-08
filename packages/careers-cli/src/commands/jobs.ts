import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'
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
    name: 'analyze-all',
    description: 'Queue analysis for all unscored applications on a job',
    method: 'POST',
    path: (id) => `/api/jobs/${encodeURIComponent(id)}/analyze-all`,
    args: [{ name: 'id', description: 'Job ID' }],
    mutation: true,
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