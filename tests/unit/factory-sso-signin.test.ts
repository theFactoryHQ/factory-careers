import { describe, expect, it, vi } from 'vitest'

type StartFactorySso = (input: {
  workEmail: string
  routeQuery: Record<string, unknown>
  localePath: (path: string) => string
  navigate: (url: string, options: { external: true }) => Promise<unknown>
  signInSso: (options: Record<string, unknown>) => Promise<{
    data?: { url?: string | null } | null
    error?: { message?: string; code?: string } | null
  }>
}) => Promise<unknown>

async function loadStartFactorySso(): Promise<StartFactorySso | undefined> {
  const module = await import('../../app/utils/factory-sso-signin').catch(() => null)
  return module?.startFactorySso as StartFactorySso | undefined
}

describe('Factory SSO sign-in routing', () => {
  it('uses the server-owned route for a blank work email and preserves the invitation', async () => {
    const startFactorySso = await loadStartFactorySso()
    expect(startFactorySso).toBeTypeOf('function')
    if (!startFactorySso) return

    const navigate = vi.fn(async () => undefined)
    const signInSso = vi.fn(async () => ({ data: null, error: null }))

    await startFactorySso({
      workEmail: '   ',
      routeQuery: { invitation: 'invite token' },
      localePath: path => path,
      navigate,
      signInSso,
    })

    expect(navigate).toHaveBeenCalledOnce()
    const [destination, options] = navigate.mock.calls[0]!
    const url = new URL(destination, 'https://careers.thefactoryhq.com')
    expect(url.pathname).toBe('/api/auth/factory-sso')
    expect(Object.fromEntries(url.searchParams)).toEqual({ invitation: 'invite token' })
    expect(options).toEqual({ external: true })
    expect(signInSso).not.toHaveBeenCalled()
  })

  it('normalizes a work email without sending a provider ID and follows the returned URL', async () => {
    const startFactorySso = await loadStartFactorySso()
    expect(startFactorySso).toBeTypeOf('function')
    if (!startFactorySso) return

    const navigate = vi.fn(async () => undefined)
    const signInSso = vi.fn(async () => ({
      data: { url: 'https://login.microsoftonline.com/authorize' },
      error: null,
    }))

    await startFactorySso({
      workEmail: '  Admin@TheFactoryHQ.com ',
      routeQuery: { redirect: '/dashboard/candidates?status=new' },
      localePath: path => path,
      navigate,
      signInSso,
    })

    expect(signInSso).toHaveBeenCalledOnce()
    const payload = signInSso.mock.calls[0]![0]
    expect(payload).toEqual({
      email: 'admin@thefactoryhq.com',
      loginHint: 'admin@thefactoryhq.com',
      callbackURL: '/dashboard/candidates?status=new',
      errorCallbackURL: '/auth/sign-in?redirect=%2Fdashboard%2Fcandidates%3Fstatus%3Dnew',
      providerType: 'oidc',
    })
    expect(payload).not.toHaveProperty('providerId')
    expect(navigate).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/authorize',
      { external: true },
    )
  })
})
