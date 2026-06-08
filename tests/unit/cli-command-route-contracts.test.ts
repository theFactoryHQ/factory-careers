import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
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

function staticApiParts(route: string): string[] {
  const routePath = route
    .replace(/^server\/api\//, '/api/')
    .replace(/\.(delete|get|patch|post|put)\.ts$/, '')
    .replace(/\/index$/, '')

  return routePath
    .split('/')
    .filter((part) => part && !part.startsWith('[') && part !== 'index')
}

type RequestBlock = {
  helper: string
  source: string
}

function requestBlocks(source: string): RequestBlock[] {
  const blocks: RequestBlock[] = []
  const pattern = /request(Json|Text|FormJson|Binary)(?:<[^>]*>)?\(\{/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    const start = match.index
    const end = source.indexOf('\n    })', start)
    if (end === -1) continue
    blocks.push({
      helper: match[1]!,
      source: source.slice(start, end),
    })
  }
  return blocks
}

function blockUsesMethod(block: RequestBlock, method: string): boolean {
  if (block.source.includes(`method: '${method}'`)) return true
  if (method === 'GET' && block.helper === 'Binary' && !block.source.includes('method:')) return true
  if (method === 'POST' && block.helper === 'FormJson' && !block.source.includes('method:')) return true
  if (method === 'GET' && block.helper === 'Json' && !block.source.includes('body,') && !block.source.includes('method:')) return true
  if (method === 'POST' && block.helper === 'Json' && block.source.includes('body,') && !block.source.includes('method:')) return true
  return false
}

function blockContainsParts(block: RequestBlock, parts: string[]): boolean {
  let searchStart = 0
  for (const part of parts) {
    const index = block.source.indexOf(part, searchStart)
    if (index === -1) return false
    searchStart = index + part.length
  }
  return true
}

function dynamicRouteEvidence(source: string, route: string): string[] {
  if (/^server\/api\/calendar\/(google|microsoft)\/connect\.get\.ts$/.test(route)) {
    const provider = route.includes('/google/') ? 'google' : 'microsoft'
    return [
      `/api/calendar/\${normalizedProvider}/connect`,
      provider === 'microsoft' ? `provider === 'microsoft'` : `: 'google'`,
    ]
  }

  if (/^server\/api\/chatbot\/(agents|folders)\//.test(route)) {
    const resource = route.includes('/agents/') ? 'agents' : 'folders'
    return [
      `/api/chatbot/\${resource.path}`,
      `path: '${resource}'`,
    ]
  }

  if (/^server\/api\/updates\/(changelog|system|version)\.get\.ts$/.test(route)) {
    const updatePath = route.match(/updates\/([^/]+)\.get\.ts$/)?.[1]
    return [
      `/api/updates/\${commandConfig.path}`,
      `path: '${updatePath}'`,
    ]
  }

  return []
}

function factoryRegisteredRouteExists(source: string, route: string): boolean {
  if (!source.includes('registerJsonCommand')) return false

  const method = expectedMethod(route)
  const isIdRoute = route.includes('/[id]')

  if (isIdRoute) {
    const factoryPath = route
      .replace(/^server\/api\//, '/api/')
      .replace(/\.(delete|get|patch|post|put)\.ts$/, '')
      .replace(/\/index$/, '')
      .replace('/[id]', '/${encodeURIComponent(id)}')

    return source
      .split('registerJsonCommand')
      .some((chunk) => chunk.includes(`method: '${method}'`) && chunk.includes(factoryPath))
  }

  const parts = staticApiParts(route)
  const basePath = `/${parts.join('/')}`

  return source
    .split('registerJsonCommand')
    .some((chunk) => chunk.includes(`method: '${method}'`) && chunk.includes(`path: '${basePath}'`))
}

function routeSpecificRequestExists(source: string, route: string): boolean {
  const method = expectedMethod(route)
  const dynamicEvidence = dynamicRouteEvidence(source, route)
  if (dynamicEvidence.length > 0 && !dynamicEvidence.every((evidence) => source.includes(evidence))) {
    return false
  }

  if (/^server\/api\/calendar\/(google|microsoft)\/connect\.get\.ts$/.test(route)) {
    return true
  }

  const parts = staticApiParts(route)
    .filter((part) => !['google', 'microsoft'].includes(part))
    .filter((part) => !(/^server\/api\/chatbot\/(agents|folders)\//.test(route) && ['agents', 'folders'].includes(part)))
    .filter((part) => !(/^server\/api\/updates\/(changelog|system|version)\.get\.ts$/.test(route) && ['changelog', 'system', 'version'].includes(part)))

  if (requestBlocks(source).some((block) =>
    blockUsesMethod(block, method) && blockContainsParts(block, parts),
  )) {
    return true
  }

  return factoryRegisteredRouteExists(source, route)
}

function readCliSources(): string {
  const srcDir = join(root, 'packages/careers-cli/src')
  const files: string[] = []

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) walk(fullPath)
      else if (entry.name.endsWith('.ts')) files.push(fullPath)
    }
  }

  walk(srcDir)
  return files.map((file) => readFileSync(file, 'utf8')).join('\n')
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
    const cliSource = readCliSources()
    const missing = cliRouteCoverage
      .filter((entry) => entry.status === 'supported')
      .filter((entry) => !routeSpecificRequestExists(cliSource, entry.route))
      .map((entry) => `${entry.route} missing route-specific ${expectedMethod(entry.route)} request`)

    expect(missing).toEqual([])
  })
})
