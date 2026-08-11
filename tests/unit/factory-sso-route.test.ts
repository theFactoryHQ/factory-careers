import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type RedirectResult = {
  location: string
  status: number
}

let query: Record<string, string> = {}
const authHandler = vi.fn<(request: Request) => Promise<Response>>()
const sendRedirect = vi.fn((_event: unknown, location: string, status: number): RedirectResult => ({
  location,
  status,
}))

let factorySsoHandler: (event: unknown) => Promise<RedirectResult>

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (handler: typeof factorySsoHandler) => handler)
  vi.stubGlobal('getQuery', () => query)
  vi.stubGlobal('getRequestURL', () => new URL('https://careers.thefactoryhq.com/api/auth/factory-sso'))
  vi.stubGlobal('getHeader', () => undefined)
  vi.stubGlobal('appendResponseHeader', vi.fn())
  vi.stubGlobal('sendRedirect', sendRedirect)
  vi.stubGlobal('env', {
    BETTER_AUTH_URL: 'https://careers.thefactoryhq.com',
    FACTORY_CAREERS_SSO_PROVIDER_ID: 'configured-provider',
  })
  vi.stubGlobal('auth', { handler: authHandler })

  factorySsoHandler = (await import('../../server/api/auth/factory-sso.get')).default as typeof factorySsoHandler
})

beforeEach(() => {
  query = {}
  authHandler.mockReset()
  sendRedirect.mockClear()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('Factory SSO server entry point', () => {
  it.each([
    {
      name: 'invitation',
      query: { invitation: 'invite token' },
      expectedQuery: { invitation: 'invite token', error: 'sso_start_failed' },
    },
    {
      name: 'safe redirect',
      query: { redirect: '/dashboard/candidates?status=new' },
      expectedQuery: { redirect: '/dashboard/candidates?status=new', error: 'sso_start_failed' },
    },
  ])('preserves the $name query when SSO startup fails', async ({ query: routeQuery, expectedQuery }) => {
    query = routeQuery
    authHandler.mockResolvedValue(new Response(null, { status: 503 }))

    const result = await factorySsoHandler({})
    const location = new URL(result.location, 'https://careers.thefactoryhq.com')

    expect(result.status).toBe(302)
    expect(location.pathname).toBe('/auth/sign-in')
    expect(Object.fromEntries(location.searchParams)).toEqual(expectedQuery)
  })

  it('preserves retry parameters when the auth response omits a redirect URL', async () => {
    query = { invitation: 'invite token' }
    authHandler.mockResolvedValue(Response.json({}))

    const result = await factorySsoHandler({})
    const location = new URL(result.location, 'https://careers.thefactoryhq.com')

    expect(result.status).toBe(302)
    expect(Object.fromEntries(location.searchParams)).toEqual({
      invitation: 'invite token',
      error: 'sso_start_failed',
    })
  })
})
