import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

const CACHED_LIST_ROUTES = [
  { file: 'server/api/jobs/index.get.ts', cacheName: 'jobs-list' },
  { file: 'server/api/candidates/index.get.ts', cacheName: 'candidates-list' },
  {
    file: 'server/api/applications/index.get.ts',
    cacheName: 'applications-list',
  },
  { file: 'server/api/interviews/index.get.ts', cacheName: 'interviews-list' },
  { file: 'server/api/dashboard/stats.get.ts', cacheName: 'dashboard-stats' },
] as const

const cachedResponse = { source: 'org-cache' }
const requirePermissionMock = vi.fn()
const getValidatedQueryMock = vi.fn()
const storageItems = new Map<string, unknown>()
let capturedCacheOptions: {
  maxAge: number
  swr: boolean
  name: string
  getKey: (organizationId: string, input: unknown) => Promise<string>
}

const createCachedFunctionMock = () =>
  vi.fn(async (_organizationId: string, _input: unknown) => cachedResponse)
const routeCachedFunctions = new Map<
  string,
  ReturnType<typeof createCachedFunctionMock>
>()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal(
  'defineCachedFunction',
  (loader: unknown, options: typeof capturedCacheOptions) => {
    capturedCacheOptions = options
    return loader
  },
)
vi.stubGlobal('useStorage', () => ({
  getItem: async (key: string) => storageItems.get(key),
  setItem: async (key: string, value: unknown) => {
    storageItems.set(key, value)
  },
}))
vi.stubGlobal('defineOrgScopedCachedFunction', (name: string) => {
  const cachedFunction = createCachedFunctionMock()
  routeCachedFunctions.set(name, cachedFunction)
  return cachedFunction
})
vi.stubGlobal('requirePermission', requirePermissionMock)
vi.stubGlobal('getValidatedQuery', getValidatedQueryMock)

const { bumpOrgDashboardCacheVersion, defineOrgScopedCachedFunction } =
  await import('../../server/utils/httpCache')

const cachedListHandlers = await Promise.all([
  import('../../server/api/jobs/index.get'),
  import('../../server/api/candidates/index.get'),
  import('../../server/api/applications/index.get'),
  import('../../server/api/interviews/index.get'),
  import('../../server/api/dashboard/stats.get'),
]).then(modules =>
  modules.map((module, index) => ({
    ...CACHED_LIST_ROUTES[index]!,
    handler: module.default as (event: unknown) => Promise<unknown>,
  })),
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
  beforeEach(() => {
    storageItems.clear()
    defineOrgScopedCachedFunction('jobs-list', async () => cachedResponse)
  })

  it('uses route-specific Nitro SWR options', () => {
    expect(capturedCacheOptions).toMatchObject({
      maxAge: 30,
      swr: true,
      name: 'org-dashboard-jobslist',
    })
  })

  it('does not collide organization IDs that differ only by punctuation', async () => {
    const input = { page: 1, limit: 20 }

    const dashedKey = await capturedCacheOptions.getKey('org-a', input)
    const compactKey = await capturedCacheOptions.getKey('orga', input)

    expect(dashedKey).not.toBe(compactKey)
  })

  it('changes keys for different normalized inputs', async () => {
    const firstKey = await capturedCacheOptions.getKey('org-a', {
      page: 1,
      limit: 20,
    })
    const secondKey = await capturedCacheOptions.getKey('org-a', {
      page: 2,
      limit: 20,
    })

    expect(firstKey).not.toBe(secondKey)
  })

  it('changes keys after the organization cache generation is bumped', async () => {
    const input = { page: 1, limit: 20 }
    const initialKey = await capturedCacheOptions.getKey('org-a', input)

    await bumpOrgDashboardCacheVersion('org-a')
    const bumpedKey = await capturedCacheOptions.getKey('org-a', input)

    expect(initialKey).not.toBe(bumpedKey)
  })
})

describe('dashboard list API authorization boundary', () => {
  beforeEach(() => {
    requirePermissionMock.mockReset()
    getValidatedQueryMock.mockReset()
    getValidatedQueryMock.mockResolvedValue({ page: 1, limit: 20 })
    for (const cachedFunction of routeCachedFunctions.values()) {
      cachedFunction.mockClear()
    }
    requirePermissionMock.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { statusCode: 403 }),
    )
  })

  it.each(cachedListHandlers)(
    '$file rechecks permission before returning an available cache hit',
    async ({ cacheName, handler }) => {
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
      expect(requirePermissionMock).toHaveBeenCalledTimes(1)
      expect(routeCachedFunctions.get(cacheName)).not.toHaveBeenCalled()
    },
  )

  it.each(cachedListHandlers)(
    '$file passes the exact authorized organization ID to the cached function',
    async ({ cacheName, handler }) => {
      requirePermissionMock.mockResolvedValue({
        session: { activeOrganizationId: 'org-a' },
      })

      await handler({})

      expect(routeCachedFunctions.get(cacheName)).toHaveBeenCalledTimes(1)
      expect(routeCachedFunctions.get(cacheName)).toHaveBeenCalledWith(
        'org-a',
        expect.anything(),
      )
    },
  )

  it.each(CACHED_LIST_ROUTES)(
    '$file keeps authorization in the outer event handler before its org cache lookup',
    ({ file }) => {
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
