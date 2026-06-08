import type { Command } from 'commander'
import { writeFileSync } from 'node:fs'
import { requestBinary, requestJson } from './api'
import type { CliRuntime, GlobalOptions } from './cliRuntime'

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

type JsonCommandArg = {
  name: string
  description: string
}

type JsonCommandOption = {
  flags: string
  description: string
  required?: boolean
}

type RequiredOptionSpec = {
  key: string
  flagName: string
}

type JsonCommandContext = {
  args: string[]
  options: Record<string, unknown>
  globals: GlobalOptions
}

export type RegisterJsonCommandConfig = {
  name: string
  description: string
  method: HttpMethod
  path: string | ((...args: string[]) => string)
  args?: JsonCommandArg[]
  options?: JsonCommandOption[]
  alias?: string | string[]
  mutation?: boolean
  stdin?: boolean
  schema?: { parse: (value: unknown) => unknown }
  body?: (context: JsonCommandContext) => unknown
  requireAuth?: boolean
  requireOptions?: RequiredOptionSpec[]
  query?: (
    options: Record<string, unknown>,
    args: string[],
  ) => Record<string, string | boolean | undefined>
  deleteAck?: boolean
  formatResult?: (context: JsonCommandContext & { result: unknown }) => unknown
}

export type RegisterBinaryDownloadConfig = {
  name: string
  description: string
  arg: JsonCommandArg
  outputOption: {
    flags: string
    description: string
  }
  path: string | ((id: string) => string)
  formatResult?: (context: {
    id: string
    outputPath: string
    bytes: number
    contentType?: string
  }) => unknown
}

function resolvePath(path: string | ((...args: string[]) => string), args: string[]): string {
  return typeof path === 'function' ? path(...args) : path
}

export function registerJsonCommand(
  runtime: CliRuntime,
  parent: Command,
  config: RegisterJsonCommandConfig,
): Command {
  let command = parent.command(config.name).description(config.description)
  if (config.alias) {
    command = command.alias(config.alias)
  }

  for (const arg of config.args ?? []) {
    command = command.argument(`<${arg.name}>`, arg.description)
  }

  for (const option of config.options ?? []) {
    command = option.required
      ? command.requiredOption(option.flags, option.description)
      : command.option(option.flags, option.description)
  }

  if (config.stdin) {
    command = command.option('--stdin', 'Read request body as JSON from stdin')
  }

  return runtime.addGlobalOptions(command).action(async (...params: unknown[]) => {
    const commandInstance = params.at(-1) as Command
    const options = params.at(-2) as Record<string, unknown>
    const args = params.slice(0, -2) as string[]
    const { globals, profile } = runtime.getContext(commandInstance, options as GlobalOptions)

    if (config.mutation) {
      runtime.requireMutationConfirmation(globals)
    }

    const token = config.requireAuth === false
      ? undefined
      : runtime.requireAuthenticatedProfile(profile)

    for (const requiredOption of config.requireOptions ?? []) {
      runtime.requireOption(options[requiredOption.key] as string | undefined, requiredOption.flagName)
    }

    const apiPath = resolvePath(config.path, args)
    let url = `${profile.baseUrl}${apiPath}`
    if (config.query) {
      url = runtime.appendQuery(url, config.query(options, args))
    }

    let body: unknown
    if (config.stdin) {
      body = await runtime.readStdinJson(runtime.io, options.stdin as boolean | undefined)
      if (config.schema) {
        body = runtime.validateStdinPayload(config.schema, body)
      }
    } else if (config.body) {
      body = config.body({ args, options, globals })
    }

    const apiResult = await requestJson<unknown>({
      fetch: runtime.getFetch(runtime.io),
      url,
      method: config.method,
      token,
      body,
    })

    const context: JsonCommandContext & { result: unknown } = {
      args,
      options,
      globals,
      result: apiResult,
    }

    let result: unknown = apiResult
    if (config.formatResult) {
      result = config.formatResult(context)
    } else if (config.deleteAck && config.method === 'DELETE') {
      result = { deleted: true, id: args[0] }
    }

    runtime.outputResult(runtime.io, globals, result)
  })
}

export function registerBinaryDownload(
  runtime: CliRuntime,
  parent: Command,
  config: RegisterBinaryDownloadConfig,
): Command {
  const command = parent
    .command(config.name)
    .description(config.description)
    .argument(`<${config.arg.name}>`, config.arg.description)
    .requiredOption(config.outputOption.flags, config.outputOption.description)

  return runtime.addGlobalOptions(command).action(async (id: string, options: Record<string, unknown>, commandInstance: Command) => {
    const { globals, profile } = runtime.getContext(commandInstance, options as GlobalOptions)
    const token = runtime.requireAuthenticatedProfile(profile)
    const outputPath = runtime.requireOption(options.output as string | undefined, config.outputOption.flags.split(' ')[0] ?? '--output')
    const apiPath = resolvePath(config.path, [id])
    const result = await requestBinary({
      fetch: runtime.getFetch(runtime.io),
      url: `${profile.baseUrl}${apiPath}`,
      token,
    })

    writeFileSync(outputPath, result.bytes)

    const payload = config.formatResult
      ? config.formatResult({
          id,
          outputPath,
          bytes: result.bytes.byteLength,
          contentType: result.contentType,
        })
      : {
          id,
          output: outputPath,
          bytes: result.bytes.byteLength,
          contentType: result.contentType,
        }

    runtime.outputResult(runtime.io, globals, payload)
  })
}