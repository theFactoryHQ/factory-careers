import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

const CACHED_LIST_HANDLERS = [
  'server/api/jobs/index.get.ts',
  'server/api/candidates/index.get.ts',
  'server/api/applications/index.get.ts',
  'server/api/interviews/index.get.ts',
  'server/api/dashboard/stats.get.ts',
] as const

const cachedResponse = { source: 'org-cache' }
const requirePermissionMock = vi.fn()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('defineCachedEventHandler', () => async () => cachedResponse)
vi.stubGlobal('orgScopedCacheOptions', {})
vi.stubGlobal('defineOrgScopedCachedFunction', () => async () => cachedResponse)
vi.stubGlobal('requirePermission', requirePermissionMock)

const cachedListHandlers = await Promise.all([
  import('../../server/api/jobs/index.get'),
  import('../../server/api/candidates/index.get'),
  import('../../server/api/applications/index.get'),
  import('../../server/api/interviews/index.get'),
  import('../../server/api/dashboard/stats.get'),
]).then(modules =>
  modules.map(module => module.default as (event: unknown) => Promise<unknown>),
)

function findOuterHandlerCalls(source: string, file: string) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const cachedFunctionNames = new Set<string>()
  let outerHandler: ts.CallExpression | undefined

  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'defineOrgScopedCachedFunction'
    ) {
      cachedFunctionNames.add(node.name.text)
    }

    if (
      ts.isExportAssignment(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'defineEventHandler'
    ) {
      outerHandler = node.expression
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  if (!outerHandler) return { cachedFunctionNames, calls: [] }
  const calls: Array<{ name: string; position: number }> = []
  const handlerArgument = outerHandler.arguments[0]

  if (handlerArgument) {
    function visitHandler(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        calls.push({
          name: node.expression.text,
          position: node.getStart(sourceFile),
        })
      }
      ts.forEachChild(node, visitHandler)
    }
    visitHandler(handlerArgument)
  }

  return { cachedFunctionNames, calls }
}

describe('defineOrgScopedCachedFunction', () => {
  it('defines org-generation SWR cache keys without request events or auth headers', () => {
    const source = readProjectFile('server/utils/httpCache.ts')

    expect(source).toContain('defineOrgScopedCachedFunction')
    expect(source).toContain('defineCachedFunction')
    expect(source).toContain('ORG_SCOPED_CACHE_MAX_AGE_SECONDS')
    expect(source).toContain('swr: true')
    expect(source).toMatch(
      /getKey:\s*async \(organizationId[^)]*,\s*input[^)]*\)/,
    )
    expect(source).toContain('getOrgDashboardCacheVersion(organizationId)')
    expect(source).toContain('hash(input)')
    expect(source).not.toContain('defineCachedEventHandler')
    expect(source).not.toContain("varies: ['cookie', 'authorization']")
  })
})

describe('dashboard list API authorization boundary', () => {
  beforeEach(() => {
    requirePermissionMock.mockReset()
    requirePermissionMock.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { statusCode: 403 }),
    )
  })

  it.each(
    cachedListHandlers.map(
      (handler, index) => [CACHED_LIST_HANDLERS[index], handler] as const,
    ),
  )(
    '%s rechecks permission before returning an available cache hit',
    async (_file, handler) => {
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
      expect(requirePermissionMock).toHaveBeenCalledTimes(1)
    },
  )

  it.each(CACHED_LIST_HANDLERS)(
    '%s keeps authorization in the outer event handler before its org cache lookup',
    file => {
      const source = readProjectFile(file)
      const { cachedFunctionNames, calls } = findOuterHandlerCalls(source, file)
      const permissionCall = calls.find(
        call => call.name === 'requirePermission',
      )
      const cachedCall = calls.find(call => cachedFunctionNames.has(call.name))

      expect(source, file).not.toContain('defineCachedEventHandler')
      expect(source, file).not.toContain('orgScopedCacheOptions')
      expect(cachedFunctionNames.size, file).toBeGreaterThan(0)
      expect(permissionCall, file).toBeDefined()
      expect(cachedCall, file).toBeDefined()
      expect(permissionCall!.position, file).toBeLessThan(cachedCall!.position)
    },
  )
})
