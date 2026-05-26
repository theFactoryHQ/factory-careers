function getSafeRedirectPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value
}

function appendAuthResponseCookies(event: Parameters<typeof appendResponseHeader>[0], response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const cookies = headers.getSetCookie?.() ?? []

  if (cookies.length) {
    for (const cookie of cookies) appendResponseHeader(event, 'set-cookie', cookie)
    return
  }

  const cookie = response.headers.get('set-cookie')
  if (cookie) appendResponseHeader(event, 'set-cookie', cookie)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const pendingInvitation = typeof query.invitation === 'string' ? query.invitation : null
  const safeRedirect = getSafeRedirectPath(query.redirect)

  const callbackURL = pendingInvitation
    ? `/auth/accept-invitation/${encodeURIComponent(pendingInvitation)}`
    : safeRedirect ?? '/dashboard'
  const errorCallbackURL = pendingInvitation
    ? `/auth/sign-in?invitation=${encodeURIComponent(pendingInvitation)}`
    : safeRedirect
      ? `/auth/sign-in?redirect=${encodeURIComponent(safeRedirect)}`
      : '/auth/sign-in'

  const baseUrl = env.BETTER_AUTH_URL?.trim() || getRequestURL(event).origin
  const request = new Request(`${baseUrl}/api/auth/sign-in/sso`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: getRequestURL(event).origin,
      cookie: getHeader(event, 'cookie') ?? '',
    },
    body: JSON.stringify({
      providerId: 'thefactoryhq-sso',
      providerType: 'oidc',
      callbackURL,
      errorCallbackURL,
    }),
  })

  const response = await auth.handler(request)
  appendAuthResponseCookies(event, response)

  if (!response.ok) {
    return sendRedirect(event, `${errorCallbackURL}?error=sso_start_failed`, 302)
  }

  const body = await response.json().catch(() => null) as { url?: unknown } | null
  if (typeof body?.url !== 'string') {
    return sendRedirect(event, `${errorCallbackURL}?error=sso_start_failed`, 302)
  }

  return sendRedirect(event, body.url, 302)
})
