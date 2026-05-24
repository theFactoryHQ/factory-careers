import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Command } from 'commander'
import { createProgram } from '../../packages/careers-cli/src/program'
import { cliRouteCoverage } from '../../packages/careers-cli/src/routeCoverage'

const root = process.cwd()

const METHOD_BY_SUFFIX: Record<string, string> = {
  'delete.ts': 'DELETE',
  'get.ts': 'GET',
  'patch.ts': 'PATCH',
  'post.ts': 'POST',
  'put.ts': 'PUT',
}

function commandPaths(command: Command, prefix: string[] = []): Set<string> {
  const paths = new Set<string>()
  for (const child of command.commands) {
    const childNames = [child.name(), ...child.aliases()]
    for (const childName of childNames) {
      const path = [...prefix, childName]
      const hasAction = Boolean((child as unknown as { _actionHandler?: unknown })._actionHandler)
      if (hasAction) paths.add(path.join(' '))
      for (const nestedPath of commandPaths(child, path)) {
        paths.add(nestedPath)
      }
    }
  }
  return paths
}

function expectedMethod(route: string): string {
  const suffix = Object.keys(METHOD_BY_SUFFIX).find((candidate) => route.endsWith(candidate))
  if (!suffix) throw new Error(`Unsupported route suffix: ${route}`)
  return METHOD_BY_SUFFIX[suffix]!
}

function expectedStaticApiFragments(route: string): string[] {
  const routePath = route
    .replace(/^server\/api\//, '/api/')
    .replace(/\.(delete|get|patch|post|put)\.ts$/, '')
    .replace(/\/index$/, '')

  return routePath
    .split('/')
    .filter((part) => part && !part.startsWith('['))
    .map((part) => `/${part}`)
}

function hasDynamicRouteRepresentation(source: string, route: string): boolean {
  if (/^server\/api\/calendar\/(google|microsoft)\/connect\.get\.ts$/.test(route)) {
    return source.includes('/api/calendar/${normalizedProvider}/connect')
  }

  if (/^server\/api\/chatbot\/(agents|folders)\//.test(route)) {
    return source.includes('/api/chatbot/${resource.path}')
  }

  if (/^server\/api\/updates\/(changelog|system|version)\.get\.ts$/.test(route)) {
    return source.includes('/api/updates/${commandConfig.path}')
  }

  return false
}

describe('CLI command route contracts', () => {
  it('keeps every supported manifest command executable', () => {
    const supported = cliRouteCoverage.filter((entry) => entry.status === 'supported')
    const availableCommands = commandPaths(createProgram())
    const missing = supported
      .map((entry) => entry.command)
      .filter((command, index, commands) => commands.indexOf(command) === index)
      .filter((command) => !availableCommands.has(command))

    expect(missing).toEqual([])
  })

  it('keeps supported route methods and paths represented by the CLI implementation', () => {
    const programSource = readFileSync(join(root, 'packages/careers-cli/src/program.ts'), 'utf8')
    const missing = cliRouteCoverage
      .filter((entry) => entry.status === 'supported')
      .flatMap((entry) => {
        const failures: string[] = []
        const method = expectedMethod(entry.route)

        if (!programSource.includes(`method: '${method}'`)) {
          failures.push(`${entry.route} missing method ${method}`)
        }

        if (hasDynamicRouteRepresentation(programSource, entry.route)) {
          return failures
        }

        for (const fragment of expectedStaticApiFragments(entry.route)) {
          if (!programSource.includes(fragment)) {
            failures.push(`${entry.route} missing path fragment ${fragment}`)
          }
        }

        return failures
      })

    expect(missing).toEqual([])
  })
})
