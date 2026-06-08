import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { timingSafeStringEqual } from './secureCompare'

const OAUTH_STATE_MAX_AGE_SECONDS = 300

type OAuthCookie = {
  name: string
  value: string
}

export type InitiateCalendarOAuthOptions = {
  stateCookieName: string
  callbackPath: string
  extraCookies?: OAuthCookie[]
  getAuthUrl: (stateToken: string) => string | Promise<string>
}

/**
 * Start a calendar OAuth flow: issue a CSRF state cookie and redirect to the provider.
 */
export async function initiateCalendarOAuth(
  event: H3Event,
  options: InitiateCalendarOAuthOptions,
) {
  const stateToken = randomBytes(32).toString('hex')

  setCookie(event, options.stateCookieName, stateToken, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    path: options.callbackPath,
  })

  for (const cookie of options.extraCookies ?? []) {
    setCookie(event, cookie.name, cookie.value, {
      httpOnly: true,
      secure: !import.meta.dev,
      sameSite: 'lax',
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
      path: options.callbackPath,
    })
  }

  const authUrl = await options.getAuthUrl(stateToken)
  return sendRedirect(event, authUrl)
}

export type CalendarOAuthCallbackQuery = {
  code?: string
  state?: string
  error?: string
}

export type HandleCalendarOAuthCallbackOptions = {
  stateCookieName: string
  callbackPath: string
  extraCookieNames?: string[]
  consentDeniedRedirect: string
  successRedirect: string
  oauthFailedRedirect: string
  onSuccess: (params: {
    code: string
    extraCookies: Record<string, string | undefined>
  }) => Promise<void>
  resolveErrorRedirect?: (error: unknown) => string | null
  logFailureEvent?: string
}

/**
 * Handle a calendar OAuth callback: validate CSRF state, run provider-specific
 * token exchange, and redirect back to integrations settings.
 */
export async function handleCalendarOAuthCallback(
  event: H3Event,
  options: HandleCalendarOAuthCallbackOptions,
) {
  const session = await requireAuth(event)
  const query = getQuery(event) as CalendarOAuthCallbackQuery

  if (query.error) {
    return sendRedirect(event, options.consentDeniedRedirect)
  }

  if (!query.code || !query.state) {
    throw createError({ statusCode: 400, statusMessage: 'Missing authorization code or state' })
  }

  const storedState = getCookie(event, options.stateCookieName)
  const extraValues = Object.fromEntries(
    (options.extraCookieNames ?? []).map((name) => [name, getCookie(event, name)]),
  )

  deleteCookie(event, options.stateCookieName, { path: options.callbackPath })
  for (const name of options.extraCookieNames ?? []) {
    deleteCookie(event, name, { path: options.callbackPath })
  }

  if (!storedState || !timingSafeStringEqual(storedState, query.state)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid OAuth state — possible CSRF attack' })
  }

  try {
    await options.onSuccess({
      code: query.code,
      extraCookies: extraValues,
    })

    return sendRedirect(event, options.successRedirect)
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (options.logFailureEvent) {
      logError(options.logFailureEvent, {
        posthog_distinct_id: session.user.id,
        error_message: message,
      })
    }

    const customRedirect = options.resolveErrorRedirect?.(err)
    if (customRedirect) {
      return sendRedirect(event, customRedirect)
    }

    return sendRedirect(event, options.oauthFailedRedirect)
  }
}