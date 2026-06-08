import type { Command } from 'commander'
import type { FetchLike } from './api'
import { resolveActiveProfile, resolveConfigPath } from './config'

export type CliIo = {
  stdout?: (value: string) => void
  stderr?: (value: string) => void
  fetch?: FetchLike
  sleep?: (ms: number) => Promise<void>
  stdin?: () => Promise<string>
}

export type GlobalOptions = {
  config?: string
  profile?: string
  baseUrl?: string
  json?: boolean
  yes?: boolean
  noInput?: boolean
}

export type StdinOptions = GlobalOptions & {
  stdin?: boolean
}

export type CliPayloadSchema = {
  parse: (value: unknown) => unknown
}

export function writeJson(io: CliIo, value: unknown): void {
  io.stdout?.(JSON.stringify(value))
}

export function getFetch(io: CliIo): FetchLike {
  return io.fetch ?? fetch
}

export function getSleep(io: CliIo): (ms: number) => Promise<void> {
  return io.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
}

function getGlobalOptions(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>()
}

export function getContext(command: Command, options: GlobalOptions) {
  const globals = { ...getGlobalOptions(command), ...options }
  const configPath = resolveConfigPath({ explicitConfig: globals.config })
  const profile = resolveActiveProfile({
    configPath,
    profile: globals.profile,
    baseUrl: globals.baseUrl,
  })

  return { globals, configPath, profile }
}

export function requireAuthenticatedProfile(profile: { token?: string }): string {
  if (!profile.token) {
    throw {
      status: 401,
      code: 'NOT_AUTHENTICATED',
      message: 'Run factory-careers auth login first.',
    }
  }

  return profile.token
}

export function requireMutationConfirmation(options: GlobalOptions): void {
  if (options.yes) return
  if ((options as GlobalOptions & { stdin?: boolean }).stdin) return

  throw {
    status: 400,
    code: 'CONFIRMATION_REQUIRED',
    message: 'Pass --yes to confirm this mutating command.',
  }
}

export async function readStdinJson(io: CliIo, enabled?: boolean): Promise<unknown> {
  if (!enabled) return undefined
  const input = io.stdin ? await io.stdin() : await new Promise<string>((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      data += chunk
    })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })

  try {
    return JSON.parse(input)
  } catch {
    throw {
      status: 400,
      code: 'INVALID_STDIN_JSON',
      message: 'Expected valid JSON on stdin.',
    }
  }
}

export function validateStdinPayload(schema: CliPayloadSchema, body: unknown): unknown {
  if (body === undefined) {
    throw {
      status: 400,
      code: 'MISSING_STDIN_PAYLOAD',
      message: 'Pass --stdin and pipe a JSON request body for this command.',
    }
  }

  try {
    return schema.parse(body)
  } catch (error) {
    const details = error && typeof error === 'object' && 'issues' in error
      ? (error as { issues: unknown }).issues
      : undefined
    throw {
      status: 400,
      code: 'INVALID_STDIN_PAYLOAD',
      message: 'Stdin JSON did not match the CLI command schema.',
      details,
    }
  }
}

export function outputResult(io: CliIo, globals: GlobalOptions, value: unknown): void {
  if (globals.json) {
    writeJson(io, value)
  } else if (typeof value === 'string') {
    io.stdout?.(value)
  } else {
    io.stdout?.(JSON.stringify(value, null, 2))
  }
}

export function appendQuery(baseUrl: string, query: Record<string, string | boolean | undefined>): string {
  const url = new URL(baseUrl)
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === false) continue
    url.searchParams.set(key, value === true ? '1' : value)
  }
  return url.toString()
}

export function requireOption(value: string | undefined, name: string): string {
  if (value) return value

  throw {
    status: 400,
    code: 'MISSING_REQUIRED_OPTION',
    message: `Missing required option ${name}.`,
  }
}

export function addGlobalOptions(command: Command): Command {
  return command
    .option('--config <path>', 'Path to Factory Careers CLI config file')
    .option('--profile <name>', 'Config profile to use')
    .option('--base-url <url>', 'Factory Careers base URL')
    .option('--json', 'Emit machine-readable JSON')
    .option('--yes', 'Confirm mutating operations without prompting')
    .option('--no-input', 'Disable interactive prompts')
}

export type CliRuntime = ReturnType<typeof createCliRuntime>

export function createCliRuntime(io: CliIo) {
  return {
    io,
    writeJson,
    getFetch,
    getSleep,
    getContext,
    requireAuthenticatedProfile,
    requireMutationConfirmation,
    readStdinJson,
    validateStdinPayload,
    outputResult,
    appendQuery,
    requireOption,
    addGlobalOptions,
  }
}