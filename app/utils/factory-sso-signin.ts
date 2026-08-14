type SsoStartResponse = {
  data?: { url?: string | null } | null
  error?: { message?: string; code?: string } | null
}

type SsoStartOptions = {
  email: string
  loginHint: string
  callbackURL: string
  errorCallbackURL: string
  providerType: 'oidc'
}

type StartFactorySsoInput = {
  workEmail: string
  routeQuery: Record<string, unknown>
  localePath: (path: string) => string
  navigate: (url: string, options: { external: true }) => unknown | Promise<unknown>
  signInSso: (options: SsoStartOptions) => Promise<SsoStartResponse>
}

export type FactorySsoStartResult =
  | { status: 'redirected' | 'started' }
  | { status: 'error'; message?: string; code?: string }

function getSafeRedirectPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value
}

export async function startFactorySso({
  workEmail,
  routeQuery,
  localePath,
  navigate,
  signInSso,
}: StartFactorySsoInput): Promise<FactorySsoStartResult> {
  const normalizedWorkEmail = workEmail.trim().toLowerCase()
  const pendingInvitation = typeof routeQuery.invitation === 'string'
    ? routeQuery.invitation
    : null
  const safeRedirect = getSafeRedirectPath(routeQuery.redirect)

  if (!normalizedWorkEmail) {
    const query = new URLSearchParams()
    if (pendingInvitation) {
      query.set('invitation', pendingInvitation)
    } else if (safeRedirect) {
      query.set('redirect', safeRedirect)
    }

    const queryString = query.toString()
    await navigate(`/api/auth/factory-sso${queryString ? `?${queryString}` : ''}`, { external: true })
    return { status: 'redirected' }
  }

  const callbackURL = pendingInvitation
    ? localePath(`/auth/accept-invitation/${pendingInvitation}`)
    : safeRedirect
      ? localePath(safeRedirect)
      : localePath('/dashboard')
  const errorCallbackURL = pendingInvitation
    ? localePath(`/auth/sign-in?invitation=${encodeURIComponent(pendingInvitation)}`)
    : safeRedirect
      ? localePath(`/auth/sign-in?redirect=${encodeURIComponent(safeRedirect)}`)
      : localePath('/auth/sign-in')

  const result = await signInSso({
    email: normalizedWorkEmail,
    loginHint: normalizedWorkEmail,
    callbackURL,
    errorCallbackURL,
    providerType: 'oidc',
  })

  if (result.error) {
    return {
      status: 'error',
      message: result.error.message,
      code: result.error.code,
    }
  }

  const redirectUrl = result.data?.url
  if (redirectUrl) {
    await navigate(redirectUrl, { external: true })
    return { status: 'redirected' }
  }

  return { status: 'started' }
}
