import { Command } from 'commander'
import { basename } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { requestBinary, requestFormJson, requestJson, requestText } from './api'
import {
  addGlobalOptions,
  appendQuery,
  createCliRuntime,
  getContext,
  getFetch,
  getSleep,
  outputResult,
  readStdinJson,
  requireAuthenticatedProfile,
  requireMutationConfirmation,
  requireOption,
  validateStdinPayload,
  writeJson,
  type CliIo,
  type GlobalOptions,
  type StdinOptions,
} from './cliRuntime'
import { registerCommentsCommands } from './commands/comments'
import { registerEmailTemplatesCommands } from './commands/email-templates'
import { registerPropertiesCommands } from './commands/properties'
import { removeProfileToken, saveProfile } from './config'
import { normalizeCliError } from './errors'
import {
  cliApplicationCreateSchema,
  cliCandidateCreateSchema,
  cliInterviewScheduleSchema,
  cliJobCreateSchema,
} from './schemas'

type DocumentUploadOptions = GlobalOptions & {
  file?: string
  type?: string
}

type DocumentDownloadOptions = GlobalOptions & {
  output?: string
}

type SourceTrackingListOptions = GlobalOptions & {
  page?: string
  limit?: string
  jobId?: string
  channel?: string
  active?: string
}

type SourceStatsOptions = GlobalOptions & {
  jobId?: string
  from?: string
  to?: string
}

type InterviewListOptions = GlobalOptions & {
  page?: string
  limit?: string
  applicationId?: string
  jobId?: string
  status?: string
  from?: string
  to?: string
}

type CalendarProviderOptions = GlobalOptions & {
  provider?: string
}

type ActivityOptions = GlobalOptions & {
  page?: string
  limit?: string
  resourceType?: string
  resourceId?: string
}

type TimelineOptions = GlobalOptions & {
  before?: string
  after?: string
  limit?: string
  resourceType?: string
}

type CandidateTimelineOptions = GlobalOptions & {
  limit?: string
}

type PublicJobListOptions = GlobalOptions & {
  page?: string
  limit?: string
  search?: string
  type?: string
  location?: string
}

const CLI_CLIENT_ID = 'factory-careers-cli'
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

type DeviceCodeResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

type DeviceTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}

type SessionResponse = {
  user?: {
    id?: string
    email?: string
    name?: string
  }
  session?: {
    activeOrganizationId?: string
  }
}

type CandidateDocumentsResponse = {
  documents?: unknown[]
}

function parseChatbotStream(value: string): { events: unknown[], text: string } {
  const events: unknown[] = []
  let text = ''

  for (const block of value.split(/\n\n+/)) {
    const data = block
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
      .trim()

    if (!data || data === '[DONE]') continue

    try {
      const event = JSON.parse(data) as { type?: unknown, text?: unknown }
      events.push(event)
      if (event.type === 'text-delta' && typeof event.text === 'string') {
        text += event.text
      }
    } catch {
      events.push({ type: 'raw', data })
    }
  }

  return { events, text }
}

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

  const auth = program
    .command('auth')
    .description('Authenticate and inspect CLI session state')

  addGlobalOptions(
    auth
      .command('status')
      .description('Show active CLI authentication status'),
  ).action((options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const result = {
      authenticated: Boolean(profile.token),
      profile: profile.profileName,
      baseUrl: profile.baseUrl,
    }

    if (globals.json) {
      writeJson(io, result)
      return
    }

    io.stdout?.(
      result.authenticated
        ? `Authenticated as profile ${result.profile} (${result.baseUrl})`
        : `Not authenticated for profile ${result.profile} (${result.baseUrl})`,
    )
  })

  addGlobalOptions(
    auth
      .command('login')
      .description('Sign in with OAuth device authorization'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, configPath, profile } = getContext(command, options)
    const fetchImpl = getFetch(io)
    const sleep = getSleep(io)
    const device = await requestJson<DeviceCodeResponse>({
      fetch: fetchImpl,
      url: `${profile.baseUrl}/api/auth/device/code`,
      body: {
        client_id: CLI_CLIENT_ID,
        scope: 'openid profile email',
      },
    })

    if (globals.json) {
      writeJson(io, {
        status: 'authorization_pending',
        profile: profile.profileName,
        verificationUri: device.verification_uri,
        verificationUriComplete: device.verification_uri_complete,
        userCode: device.user_code,
        expiresIn: device.expires_in,
        interval: device.interval,
      })
    } else {
      io.stdout?.(`Open ${device.verification_uri_complete}`)
      io.stdout?.(`Enter code ${device.user_code}`)
    }

    let intervalMs = Math.max(1, device.interval || 5) * 1000
    const expiresAt = Date.now() + (device.expires_in * 1000)

    while (Date.now() < expiresAt) {
      try {
        const token = await requestJson<DeviceTokenResponse>({
          fetch: fetchImpl,
          url: `${profile.baseUrl}/api/auth/device/token`,
          body: {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
            client_id: CLI_CLIENT_ID,
          },
        })

        saveProfile({
          configPath,
          profileName: profile.profileName,
          baseUrl: profile.baseUrl,
          token: token.access_token,
        })

        const result = {
          authenticated: true,
          profile: profile.profileName,
          baseUrl: profile.baseUrl,
        }

        if (globals.json) writeJson(io, result)
        else io.stdout?.(`Authenticated as profile ${result.profile} (${result.baseUrl})`)
        return
      } catch (err) {
        const normalized = normalizeCliError(err)
        if (normalized.code === 'authorization_pending') {
          await sleep(intervalMs)
          continue
        }
        if (normalized.code === 'slow_down') {
          intervalMs += 5000
          await sleep(intervalMs)
          continue
        }
        throw normalized
      }
    }

    throw {
      status: 408,
      code: 'DEVICE_AUTH_TIMEOUT',
      message: 'Device authorization expired before approval.',
    }
  })

  addGlobalOptions(
    auth
      .command('logout')
      .description('Remove the stored token for the active profile'),
  ).action((options: GlobalOptions, command: Command) => {
    const { globals, configPath, profile } = getContext(command, options)
    removeProfileToken({
      configPath,
      profileName: profile.profileName,
      baseUrl: profile.baseUrl,
    })

    const result = {
      authenticated: false,
      profile: profile.profileName,
      baseUrl: profile.baseUrl,
    }

    if (globals.json) writeJson(io, result)
    else io.stdout?.(`Logged out of profile ${result.profile}`)
  })

  addGlobalOptions(
    auth
      .command('whoami')
      .description('Show the authenticated Factory Careers user'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    if (!profile.token) {
      throw {
        status: 401,
        code: 'NOT_AUTHENTICATED',
        message: 'Run factory-careers auth login first.',
      }
    }

    const session = await requestJson<SessionResponse>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/auth/get-session`,
      token: profile.token,
    })
    const result = {
      profile: profile.profileName,
      baseUrl: profile.baseUrl,
      user: session.user,
      activeOrganizationId: session.session?.activeOrganizationId,
    }

    if (globals.json) writeJson(io, result)
    else io.stdout?.(`${session.user?.name || session.user?.email || session.user?.id || 'Authenticated user'} (${profile.baseUrl})`)
  })

  const jobs = program
    .command('jobs')
    .description('Manage jobs')

  addGlobalOptions(
    jobs
      .command('list')
      .description('List jobs'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    jobs
      .command('get')
      .description('Get a job by ID')
      .argument('<id>', 'Job ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(id)}`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    jobs
      .command('create')
      .description('Create a job')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = validateStdinPayload(cliJobCreateSchema, await readStdinJson(io, options.stdin))
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    jobs
      .command('update')
      .description('Update a job')
      .argument('<id>', 'Job ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (id: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(id)}`,
      method: 'PATCH',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    jobs
      .command('delete')
      .description('Delete a job')
      .argument('<id>', 'Job ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(id)}`,
      method: 'DELETE',
      token,
    })

    outputResult(io, globals, result)
  })

  for (const [commandName, status] of [
    ['open', 'open'],
    ['close', 'closed'],
    ['archive', 'archived'],
  ] as const) {
    addGlobalOptions(
      jobs
        .command(commandName)
        .description(`${commandName[0]?.toUpperCase()}${commandName.slice(1)} a job`)
        .argument('<id>', 'Job ID'),
    ).action(async (id: string, options: GlobalOptions, command: Command) => {
      const { globals, profile } = getContext(command, options)
      requireMutationConfirmation(globals)
      const token = requireAuthenticatedProfile(profile)
      const result = await requestJson<unknown>({
        fetch: getFetch(io),
        url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(id)}`,
        method: 'PATCH',
        token,
        body: { status },
      })

      outputResult(io, globals, result)
    })
  }

  addGlobalOptions(
    jobs
      .command('analyze-all')
      .description('Queue analysis for all unscored applications on a job')
      .argument('<id>', 'Job ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(id)}/analyze-all`,
      method: 'POST',
      token,
    })

    outputResult(io, globals, result)
  })

  const jobQuestions = jobs
    .command('questions')
    .description('Manage job application questions')

  addGlobalOptions(
    jobQuestions
      .command('list')
      .description('List job questions')
      .argument('<jobId>', 'Job ID'),
  ).action(async (jobId: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(jobId)}/questions`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    jobQuestions
      .command('create')
      .description('Create a job question')
      .argument('<jobId>', 'Job ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (jobId: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(jobId)}/questions`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    jobQuestions
      .command('update')
      .description('Update a job question')
      .argument('<jobId>', 'Job ID')
      .argument('<questionId>', 'Question ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (jobId: string, questionId: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(jobId)}/questions/${encodeURIComponent(questionId)}`,
      method: 'PATCH',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    jobQuestions
      .command('delete')
      .description('Delete a job question')
      .argument('<jobId>', 'Job ID')
      .argument('<questionId>', 'Question ID'),
  ).action(async (jobId: string, questionId: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(jobId)}/questions/${encodeURIComponent(questionId)}`,
      method: 'DELETE',
      token,
    })

    outputResult(io, globals, { deleted: true, id: questionId })
  })

  addGlobalOptions(
    jobQuestions
      .command('reorder')
      .description('Reorder job questions')
      .argument('<jobId>', 'Job ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (jobId: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(jobId)}/questions/reorder`,
      method: 'PUT',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  const jobCriteria = jobs
    .command('criteria')
    .description('Manage job scoring criteria')

  addGlobalOptions(
    jobCriteria
      .command('list')
      .description('List job scoring criteria')
      .argument('<jobId>', 'Job ID'),
  ).action(async (jobId: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(jobId)}/criteria`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    jobCriteria
      .command('replace')
      .description('Replace job scoring criteria')
      .argument('<jobId>', 'Job ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (jobId: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(jobId)}/criteria`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    jobCriteria
      .command('update-weights')
      .description('Update job scoring criterion weights')
      .argument('<jobId>', 'Job ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (jobId: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(jobId)}/criteria`,
      method: 'PATCH',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    jobCriteria
      .command('generate')
      .description('Generate job scoring criteria')
      .argument('<jobId>', 'Job ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (jobId: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/jobs/${encodeURIComponent(jobId)}/criteria/generate`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  const candidates = program
    .command('candidates')
    .description('Manage candidates')

  addGlobalOptions(
    candidates
      .command('list')
      .description('List candidates'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/candidates`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    candidates
      .command('get')
      .description('Get a candidate by ID')
      .argument('<id>', 'Candidate ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/candidates/${encodeURIComponent(id)}`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    candidates
      .command('create')
      .description('Create a candidate')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = validateStdinPayload(cliCandidateCreateSchema, await readStdinJson(io, options.stdin))
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/candidates`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    candidates
      .command('update')
      .description('Update a candidate')
      .argument('<id>', 'Candidate ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (id: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/candidates/${encodeURIComponent(id)}`,
      method: 'PATCH',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    candidates
      .command('delete')
      .description('Delete a candidate')
      .argument('<id>', 'Candidate ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/candidates/${encodeURIComponent(id)}`,
      method: 'DELETE',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    candidates
      .command('set-property')
      .description('Set a candidate custom property value')
      .argument('<candidateId>', 'Candidate ID')
      .argument('<propertyId>', 'Property definition ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (candidateId: string, propertyId: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/candidates/${encodeURIComponent(candidateId)}/properties/${encodeURIComponent(propertyId)}`,
      method: 'PUT',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  const documents = program
    .command('documents')
    .description('Manage candidate documents')

  addGlobalOptions(
    documents
      .command('list')
      .description('List documents attached to a candidate')
      .argument('<candidateId>', 'Candidate ID'),
  ).action(async (candidateId: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const candidate = await requestJson<CandidateDocumentsResponse>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/candidates/${encodeURIComponent(candidateId)}`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, {
      candidateId,
      documents: Array.isArray(candidate.documents) ? candidate.documents : [],
    })
  })

  addGlobalOptions(
    documents
      .command('upload')
      .description('Upload a document for a candidate')
      .argument('<candidateId>', 'Candidate ID')
      .requiredOption('--file <path>', 'Path to the document file')
      .option('--type <type>', 'Document type: resume, cover_letter, or other', 'resume'),
  ).action(async (candidateId: string, options: DocumentUploadOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const filePath = requireOption(options.file, '--file')
    const documentType = options.type ?? 'resume'
    const file = readFileSync(filePath)
    const form = new FormData()
    form.append('type', documentType)
    form.append('file', new Blob([file]), basename(filePath))

    const result = await requestFormJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/candidates/${encodeURIComponent(candidateId)}/documents`,
      token,
      form,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    documents
      .command('download')
      .description('Download a document')
      .argument('<id>', 'Document ID')
      .requiredOption('--output <path>', 'Path where the downloaded document should be written'),
  ).action(async (id: string, options: DocumentDownloadOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const outputPath = requireOption(options.output, '--output')
    const result = await requestBinary({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/documents/${encodeURIComponent(id)}/download`,
      token,
    })

    writeFileSync(outputPath, result.bytes)
    outputResult(io, globals, {
      id,
      output: outputPath,
      bytes: result.bytes.byteLength,
      contentType: result.contentType,
    })
  })

  addGlobalOptions(
    documents
      .command('preview')
      .description('Download a same-origin PDF preview stream')
      .argument('<id>', 'Document ID')
      .requiredOption('--output <path>', 'Path where the preview PDF should be written'),
  ).action(async (id: string, options: DocumentDownloadOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const outputPath = requireOption(options.output, '--output')
    const result = await requestBinary({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/documents/${encodeURIComponent(id)}/preview`,
      token,
    })

    writeFileSync(outputPath, result.bytes)
    outputResult(io, globals, {
      id,
      output: outputPath,
      bytes: result.bytes.byteLength,
      contentType: result.contentType,
    })
  })

  addGlobalOptions(
    documents
      .command('delete')
      .description('Delete a document')
      .argument('<id>', 'Document ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/documents/${encodeURIComponent(id)}`,
      method: 'DELETE',
      token,
    })

    outputResult(io, globals, { deleted: true, id })
  })

  addGlobalOptions(
    documents
      .command('parse')
      .description('Re-parse an existing document')
      .argument('<id>', 'Document ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/documents/${encodeURIComponent(id)}/parse`,
      method: 'POST',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    documents
      .command('parse-all')
      .description('Re-parse all unparsed documents in the active organization'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/documents/parse-all`,
      method: 'POST',
      token,
    })

    outputResult(io, globals, result)
  })

  registerCommentsCommands(program, runtime)
  registerEmailTemplatesCommands(program, runtime)
  registerPropertiesCommands(program, runtime)

  const feedback = program
    .command('feedback')
    .description('Inspect and submit authenticated product feedback')

  addGlobalOptions(
    feedback
      .command('status')
      .description('Show whether feedback submission is configured'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/feedback/config`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    feedback
      .command('submit')
      .description('Submit product feedback from stdin JSON')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/feedback`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  const system = program
    .command('system')
    .description('Read system diagnostics and update metadata')

  for (const commandConfig of [
    { name: 'info', path: 'system', description: 'Show system diagnostics' },
    { name: 'version', path: 'version', description: 'Show version and update status' },
    { name: 'changelog', path: 'changelog', description: 'Show structured changelog entries' },
  ] as const) {
    addGlobalOptions(
      system
        .command(commandConfig.name)
        .description(commandConfig.description),
    ).action(async (options: GlobalOptions, command: Command) => {
      const { globals, profile } = getContext(command, options)
      const token = requireAuthenticatedProfile(profile)
      const result = await requestJson<unknown>({
        fetch: getFetch(io),
        url: `${profile.baseUrl}/api/updates/${commandConfig.path}`,
        method: 'GET',
        token,
      })

      outputResult(io, globals, result)
    })
  }

  addGlobalOptions(
    system
      .command('capabilities')
      .description('Show the authenticated CLI/API compatibility contract'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/cli/capabilities`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  const sourceTracking = program
    .command('source-tracking')
    .description('Manage source tracking links and analytics')

  addGlobalOptions(
    sourceTracking
      .command('list')
      .description('List tracking links')
      .option('--page <number>', 'Page number')
      .option('--limit <number>', 'Page size')
      .option('--job-id <id>', 'Filter by job ID')
      .option('--channel <channel>', 'Filter by source channel')
      .option('--active <true|false>', 'Filter by active state'),
  ).action(async (options: SourceTrackingListOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: appendQuery(`${profile.baseUrl}/api/tracking-links`, {
        page: options.page,
        limit: options.limit,
        jobId: options.jobId,
        channel: options.channel,
        isActive: options.active,
      }),
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    sourceTracking
      .command('get')
      .description('Get a tracking link')
      .argument('<id>', 'Tracking link ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/tracking-links/${encodeURIComponent(id)}`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    sourceTracking
      .command('create')
      .description('Create a tracking link')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/tracking-links`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    sourceTracking
      .command('update')
      .description('Update a tracking link')
      .argument('<id>', 'Tracking link ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (id: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/tracking-links/${encodeURIComponent(id)}`,
      method: 'PATCH',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    sourceTracking
      .command('delete')
      .description('Delete a tracking link')
      .argument('<id>', 'Tracking link ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/tracking-links/${encodeURIComponent(id)}`,
      method: 'DELETE',
      token,
    })

    outputResult(io, globals, { deleted: true, id })
  })

  addGlobalOptions(
    sourceTracking
      .command('link-stats')
      .description('Show stats for a tracking link')
      .argument('<id>', 'Tracking link ID')
      .option('--from <datetime>', 'Inclusive start datetime')
      .option('--to <datetime>', 'Inclusive end datetime'),
  ).action(async (id: string, options: SourceStatsOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: appendQuery(`${profile.baseUrl}/api/tracking-links/${encodeURIComponent(id)}/stats`, {
        from: options.from,
        to: options.to,
      }),
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    sourceTracking
      .command('stats')
      .description('Show source tracking stats')
      .option('--job-id <id>', 'Filter by job ID')
      .option('--from <datetime>', 'Inclusive start datetime')
      .option('--to <datetime>', 'Inclusive end datetime'),
  ).action(async (options: SourceStatsOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: appendQuery(`${profile.baseUrl}/api/source-tracking/stats`, {
        jobId: options.jobId,
        from: options.from,
        to: options.to,
      }),
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  const interviews = program
    .command('interviews')
    .description('Manage interviews')

  addGlobalOptions(
    interviews
      .command('list')
      .description('List interviews')
      .option('--page <number>', 'Page number')
      .option('--limit <number>', 'Page size')
      .option('--application-id <id>', 'Filter by application ID')
      .option('--job-id <id>', 'Filter by job ID')
      .option('--status <status>', 'Filter by interview status')
      .option('--from <datetime>', 'Inclusive start datetime')
      .option('--to <datetime>', 'Inclusive end datetime'),
  ).action(async (options: InterviewListOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: appendQuery(`${profile.baseUrl}/api/interviews`, {
        page: options.page,
        limit: options.limit,
        applicationId: options.applicationId,
        jobId: options.jobId,
        status: options.status,
        from: options.from,
        to: options.to,
      }),
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    interviews
      .command('get')
      .description('Get an interview by ID')
      .argument('<id>', 'Interview ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/interviews/${encodeURIComponent(id)}`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    interviews
      .command('schedule')
      .description('Schedule an interview')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = validateStdinPayload(cliInterviewScheduleSchema, await readStdinJson(io, options.stdin))
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/interviews`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    interviews
      .command('update')
      .description('Update an interview')
      .argument('<id>', 'Interview ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (id: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/interviews/${encodeURIComponent(id)}`,
      method: 'PATCH',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    interviews
      .command('delete')
      .alias('cancel')
      .description('Delete or cancel an interview')
      .argument('<id>', 'Interview ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/interviews/${encodeURIComponent(id)}`,
      method: 'DELETE',
      token,
    })

    outputResult(io, globals, { deleted: true, id })
  })

  addGlobalOptions(
    interviews
      .command('send-invitation')
      .description('Send an interview invitation')
      .argument('<id>', 'Interview ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (id: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/interviews/${encodeURIComponent(id)}/send-invitation`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  const org = program
    .command('org')
    .description('Manage organization settings and access')

  addGlobalOptions(
    org
      .command('search')
      .description('Search organizations by slug or name')
      .argument('<query>', 'Organization slug or name query'),
  ).action(async (query: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: appendQuery(`${profile.baseUrl}/api/org-search`, { q: query }),
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    org
      .command('settings')
      .description('Show organization settings'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/org-settings`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    org
      .command('update-settings')
      .description('Update organization settings')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/org-settings`,
      method: 'PATCH',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  const inviteLinks = org
    .command('invite-links')
    .description('Manage invite links')

  addGlobalOptions(
    inviteLinks
      .command('info')
      .description('Show public metadata for an invite link token')
      .argument('<token>', 'Invite link token'),
  ).action(async (tokenValue: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/invite-links/info/${encodeURIComponent(tokenValue)}`,
      method: 'GET',
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    inviteLinks
      .command('list')
      .description('List invite links'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/invite-links`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    inviteLinks
      .command('create')
      .description('Create an invite link')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/invite-links`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    inviteLinks
      .command('accept')
      .description('Accept an invite link from stdin JSON')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/invite-links/accept`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    inviteLinks
      .command('revoke')
      .description('Revoke an invite link')
      .argument('<id>', 'Invite link ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/invite-links/${encodeURIComponent(id)}`,
      method: 'DELETE',
      token,
    })

    outputResult(io, globals, result)
  })

  const joinRequests = org
    .command('join-requests')
    .description('Manage join requests')

  addGlobalOptions(
    joinRequests
      .command('list')
      .description('List pending join requests'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/join-requests`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    joinRequests
      .command('create')
      .description('Create a request to join an organization')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/join-requests`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    joinRequests
      .command('approve')
      .description('Approve a join request')
      .argument('<id>', 'Join request ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/join-requests/${encodeURIComponent(id)}/approve`,
      method: 'POST',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    joinRequests
      .command('reject')
      .description('Reject a join request')
      .argument('<id>', 'Join request ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/join-requests/${encodeURIComponent(id)}/reject`,
      method: 'POST',
      token,
    })

    outputResult(io, globals, result)
  })

  const ssoProviders = org
    .command('sso-providers')
    .description('Manage organization SSO providers')

  addGlobalOptions(
    ssoProviders
      .command('list')
      .description('List SSO providers'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/sso/providers`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    ssoProviders
      .command('register')
      .description('Register an OIDC SSO provider')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/sso/providers`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    ssoProviders
      .command('delete')
      .alias('remove')
      .description('Delete an SSO provider')
      .argument('<id>', 'SSO provider ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/sso/providers/${encodeURIComponent(id)}`,
      method: 'DELETE',
      token,
    })

    outputResult(io, globals, result)
  })

  const calendar = program
    .command('calendar')
    .description('Manage calendar integrations')

  addGlobalOptions(
    calendar
      .command('status')
      .description('Show calendar integration status'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/calendar/status`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    calendar
      .command('connect')
      .description('Print the provider connection URL')
      .argument('[provider]', 'Calendar provider: google or microsoft', 'google'),
  ).action((provider: string, options: CalendarProviderOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const normalizedProvider = provider === 'microsoft' ? 'microsoft' : 'google'
    outputResult(io, globals, {
      provider: normalizedProvider,
      url: `${profile.baseUrl}/api/calendar/${normalizedProvider}/connect`,
    })
  })

  addGlobalOptions(
    calendar
      .command('disconnect')
      .description('Disconnect calendar integration'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/calendar/disconnect`,
      method: 'POST',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    calendar
      .command('renew-webhooks')
      .description('Renew expiring calendar webhooks'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/calendar/renew-webhooks`,
      method: 'POST',
      token,
    })

    outputResult(io, globals, result)
  })

  const dashboard = program
    .command('dashboard')
    .description('Read dashboard and activity data')

  addGlobalOptions(
    dashboard
      .command('summary')
      .description('Show dashboard summary stats'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/dashboard/stats`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    dashboard
      .command('activity')
      .description('List activity log entries')
      .option('--page <number>', 'Page number')
      .option('--limit <number>', 'Page size')
      .option('--resource-type <type>', 'Filter by resource type')
      .option('--resource-id <id>', 'Filter by resource ID'),
  ).action(async (options: ActivityOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: appendQuery(`${profile.baseUrl}/api/activity-log`, {
        page: options.page,
        limit: options.limit,
        resourceType: options.resourceType,
        resourceId: options.resourceId,
      }),
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    dashboard
      .command('timeline')
      .description('Show enriched activity timeline')
      .option('--before <datetime>', 'Fetch entries before this datetime')
      .option('--after <datetime>', 'Fetch entries after this datetime')
      .option('--limit <number>', 'Maximum entries to return')
      .option('--resource-type <type>', 'Filter by resource type'),
  ).action(async (options: TimelineOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: appendQuery(`${profile.baseUrl}/api/activity-log/timeline`, {
        limit: options.limit,
        resourceType: options.resourceType,
        before: options.before,
        after: options.after,
      }),
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    dashboard
      .command('candidate-timeline')
      .description('Show activity timeline for a candidate')
      .argument('<candidateId>', 'Candidate ID')
      .option('--limit <number>', 'Maximum entries to return'),
  ).action(async (candidateId: string, options: CandidateTimelineOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: appendQuery(`${profile.baseUrl}/api/activity-log/candidate-timeline`, {
        candidateId,
        limit: options.limit,
      }),
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    dashboard
      .command('ai-stats')
      .description('Show AI analysis usage stats'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/ai-analysis/stats`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  const aiConfig = program
    .command('ai-config')
    .description('Manage AI provider configurations')

  addGlobalOptions(
    aiConfig
      .command('list')
      .description('List AI configurations'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/ai-config`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    aiConfig
      .command('get')
      .description('Get an AI configuration')
      .argument('<id>', 'AI configuration ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/ai-config/${encodeURIComponent(id)}`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    aiConfig
      .command('create')
      .description('Create an AI configuration')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/ai-config`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    aiConfig
      .command('update')
      .description('Update an AI configuration')
      .argument('<id>', 'AI configuration ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (id: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/ai-config/${encodeURIComponent(id)}`,
      method: 'PATCH',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    aiConfig
      .command('delete')
      .description('Delete an AI configuration')
      .argument('<id>', 'AI configuration ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/ai-config/${encodeURIComponent(id)}`,
      method: 'DELETE',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    aiConfig
      .command('set-default')
      .description('Set default AI configuration purpose slots')
      .argument('<id>', 'AI configuration ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (id: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/ai-config/${encodeURIComponent(id)}/set-default`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    aiConfig
      .command('test-connection')
      .description('Test an AI configuration')
      .argument('<id>', 'AI configuration ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/ai-config/${encodeURIComponent(id)}/test-connection`,
      method: 'POST',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    aiConfig
      .command('providers')
      .description('List supported AI providers and models'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/ai-config/providers`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    aiConfig
      .command('refresh-providers')
      .description('Refresh provider model catalogs')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/ai-config/providers/refresh`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    aiConfig
      .command('generate-criteria')
      .description('Generate scoring criteria from a job description')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/ai-config/generate-criteria`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  const chatbot = program
    .command('chatbot')
    .description('Manage chatbot conversations, folders, agents, and prompts')

  addGlobalOptions(
    chatbot
      .command('upload')
      .description('Upload a chatbot attachment')
      .requiredOption('--file <path>', 'Path to the attachment file'),
  ).action(async (options: DocumentUploadOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const filePath = requireOption(options.file, '--file')
    const file = readFileSync(filePath)
    const form = new FormData()
    form.append('file', new Blob([file]), basename(filePath))

    const result = await requestFormJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/chatbot/upload`,
      token,
      form,
    })

    outputResult(io, globals, result)
  })

  const chatbotConversations = chatbot
    .command('conversations')
    .description('Manage chatbot conversations')

  addGlobalOptions(
    chatbotConversations
      .command('list')
      .description('List chatbot conversations'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/chatbot/conversations`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    chatbotConversations
      .command('create')
      .description('Create a chatbot conversation')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/chatbot/conversations`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    chatbotConversations
      .command('get')
      .description('Get a chatbot conversation')
      .argument('<id>', 'Conversation ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/chatbot/conversations/${encodeURIComponent(id)}`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    chatbotConversations
      .command('update')
      .description('Update a chatbot conversation')
      .argument('<id>', 'Conversation ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (id: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/chatbot/conversations/${encodeURIComponent(id)}`,
      method: 'PATCH',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    chatbotConversations
      .command('delete')
      .description('Delete a chatbot conversation')
      .argument('<id>', 'Conversation ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/chatbot/conversations/${encodeURIComponent(id)}`,
      method: 'DELETE',
      token,
    })

    outputResult(io, globals, result)
  })

  const chatbotFolders = chatbot
    .command('folders')
    .description('Manage chatbot folders')

  for (const resource of [
    { command: chatbotFolders, name: 'folders', path: 'folders', singular: 'folder' },
    { command: chatbot.command('agents').description('Manage chatbot agents'), name: 'agents', path: 'agents', singular: 'agent' },
  ]) {
    addGlobalOptions(
      resource.command
        .command('list')
        .description(`List chatbot ${resource.name}`),
    ).action(async (options: GlobalOptions, command: Command) => {
      const { globals, profile } = getContext(command, options)
      const token = requireAuthenticatedProfile(profile)
      const result = await requestJson<unknown>({
        fetch: getFetch(io),
        url: `${profile.baseUrl}/api/chatbot/${resource.path}`,
        method: 'GET',
        token,
      })

      outputResult(io, globals, result)
    })

    addGlobalOptions(
      resource.command
        .command('create')
        .description(`Create a chatbot ${resource.singular}`)
        .option('--stdin', 'Read request body as JSON from stdin'),
    ).action(async (options: StdinOptions, command: Command) => {
      const { globals, profile } = getContext(command, options)
      requireMutationConfirmation(globals)
      const token = requireAuthenticatedProfile(profile)
      const body = await readStdinJson(io, options.stdin)
      const result = await requestJson<unknown>({
        fetch: getFetch(io),
        url: `${profile.baseUrl}/api/chatbot/${resource.path}`,
        method: 'POST',
        token,
        body,
      })

      outputResult(io, globals, result)
    })

    addGlobalOptions(
      resource.command
        .command('update')
        .description(`Update a chatbot ${resource.singular}`)
        .argument('<id>', `${resource.singular} ID`)
        .option('--stdin', 'Read request body as JSON from stdin'),
    ).action(async (id: string, options: StdinOptions, command: Command) => {
      const { globals, profile } = getContext(command, options)
      requireMutationConfirmation(globals)
      const token = requireAuthenticatedProfile(profile)
      const body = await readStdinJson(io, options.stdin)
      const result = await requestJson<unknown>({
        fetch: getFetch(io),
        url: `${profile.baseUrl}/api/chatbot/${resource.path}/${encodeURIComponent(id)}`,
        method: 'PATCH',
        token,
        body,
      })

      outputResult(io, globals, result)
    })

    addGlobalOptions(
      resource.command
        .command('delete')
        .description(`Delete a chatbot ${resource.singular}`)
        .argument('<id>', `${resource.singular} ID`),
    ).action(async (id: string, options: GlobalOptions, command: Command) => {
      const { globals, profile } = getContext(command, options)
      requireMutationConfirmation(globals)
      const token = requireAuthenticatedProfile(profile)
      const result = await requestJson<unknown>({
        fetch: getFetch(io),
        url: `${profile.baseUrl}/api/chatbot/${resource.path}/${encodeURIComponent(id)}`,
        method: 'DELETE',
        token,
      })

      outputResult(io, globals, result)
    })
  }

  addGlobalOptions(
    chatbot
      .command('chat')
      .description('Send a chatbot prompt and collect streamed events')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const stream = await requestText({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/chatbot/chat`,
      method: 'POST',
      token,
      body,
    })

    const result = parseChatbotStream(stream)
    outputResult(io, globals, result)
  })

  const publicCommands = program
    .command('public')
    .description('Use public careers endpoints')

  const publicJobs = publicCommands
    .command('jobs')
    .description('Use public job board endpoints')

  addGlobalOptions(
    publicJobs
      .command('list')
      .description('List public jobs')
      .option('--page <number>', 'Page number')
      .option('--limit <number>', 'Page size')
      .option('--search <query>', 'Search jobs by title or location')
      .option('--type <type>', 'Filter by job type')
      .option('--location <location>', 'Filter by location'),
  ).action(async (options: PublicJobListOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: appendQuery(`${profile.baseUrl}/api/public/jobs`, {
        page: options.page,
        limit: options.limit,
        search: options.search,
        type: options.type,
        location: options.location,
      }),
      method: 'GET',
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    publicJobs
      .command('get')
      .description('Get a public job by slug')
      .argument('<slug>', 'Public job slug'),
  ).action(async (slug: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/public/jobs/${encodeURIComponent(slug)}`,
      method: 'GET',
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    publicJobs
      .command('apply')
      .description('Submit a public application as JSON')
      .argument('<slug>', 'Public job slug')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (slug: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/public/jobs/${encodeURIComponent(slug)}/apply`,
      method: 'POST',
      body,
    })

    outputResult(io, globals, result)
  })

  const applications = program
    .command('applications')
    .description('Manage applications')

  addGlobalOptions(
    applications
      .command('list')
      .description('List applications'),
  ).action(async (options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/applications`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    applications
      .command('get')
      .description('Get an application by ID')
      .argument('<id>', 'Application ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/applications/${encodeURIComponent(id)}`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    applications
      .command('create')
      .description('Create an application')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = validateStdinPayload(cliApplicationCreateSchema, await readStdinJson(io, options.stdin))
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/applications`,
      method: 'POST',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    applications
      .command('update')
      .description('Update an application')
      .argument('<id>', 'Application ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (id: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/applications/${encodeURIComponent(id)}`,
      method: 'PATCH',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    applications
      .command('status')
      .description('Update an application pipeline status')
      .argument('<id>', 'Application ID')
      .argument('<status>', 'Pipeline status'),
  ).action(async (id: string, status: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/applications/${encodeURIComponent(id)}`,
      method: 'PATCH',
      token,
      body: { status },
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    applications
      .command('analyze')
      .description('Run AI analysis for an application')
      .argument('<id>', 'Application ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/applications/${encodeURIComponent(id)}/analyze`,
      method: 'POST',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    applications
      .command('scores')
      .description('Get application scores')
      .argument('<id>', 'Application ID'),
  ).action(async (id: string, options: GlobalOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    const token = requireAuthenticatedProfile(profile)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/applications/${encodeURIComponent(id)}/scores`,
      method: 'GET',
      token,
    })

    outputResult(io, globals, result)
  })

  addGlobalOptions(
    applications
      .command('set-property')
      .description('Set an application custom property value')
      .argument('<applicationId>', 'Application ID')
      .argument('<propertyId>', 'Property definition ID')
      .option('--stdin', 'Read request body as JSON from stdin'),
  ).action(async (applicationId: string, propertyId: string, options: StdinOptions, command: Command) => {
    const { globals, profile } = getContext(command, options)
    requireMutationConfirmation(globals)
    const token = requireAuthenticatedProfile(profile)
    const body = await readStdinJson(io, options.stdin)
    const result = await requestJson<unknown>({
      fetch: getFetch(io),
      url: `${profile.baseUrl}/api/applications/${encodeURIComponent(applicationId)}/properties/${encodeURIComponent(propertyId)}`,
      method: 'PUT',
      token,
      body,
    })

    outputResult(io, globals, result)
  })

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
