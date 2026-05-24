import type { H3Event } from 'h3'
import { isFactoryInitialOwnerEmail } from '../../utils/factoryAccess'
import { isSignupEmailAllowedByOrgSettings } from '../../utils/signupDomainAllowlist'

export default defineEventHandler(async (event) => {
  await enforceFactoryAuthPolicy(event)

  try {
    return await auth.handler(toWebRequest(event))
  } catch (error) {
    const requestUrl = getRequestURL(event)
    logError('auth.handler_error', {
      http_method: event.method,
      http_path: requestUrl.pathname,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    })

    // Detect BETTER_AUTH_URL mismatch — the #1 self-hosting setup issue
    const requestOrigin = getRequestURL(event, { xForwardedHost: true }).origin
    const configuredUrl = env.BETTER_AUTH_URL?.trim() || env.RAILWAY_PUBLIC_DOMAIN?.trim()
    const configuredOrigin = configuredUrl
      ? (() => { try { return new URL(configuredUrl.startsWith('http') ? configuredUrl : `https://${configuredUrl}`).origin } catch { return configuredUrl } })()
      : undefined
    const isUrlMismatch = configuredOrigin && requestOrigin !== configuredOrigin

    if (isUrlMismatch) {
      logError('auth.url_mismatch', {
        configured_origin: configuredOrigin,
        request_origin: requestOrigin,
      })
      throw createError({
        statusCode: 500,
        statusMessage: 'Auth configuration error',
        data: {
          code: 'AUTH_URL_MISMATCH',
          message: `BETTER_AUTH_URL is set to "${configuredOrigin}" but this request came from "${requestOrigin}". `
            + 'Update the BETTER_AUTH_URL environment variable to match your deployment domain, then redeploy.',
        },
      })
    }

    const exposeDetails = isRailwayPreviewEnvironment(env.RAILWAY_ENVIRONMENT_NAME) || import.meta.dev
    const details = error instanceof Error ? error.message : 'Unknown error'

    throw createError({
      statusCode: 500,
      statusMessage: 'Server Error',
      data: {
        code: 'AUTH_HANDLER_ERROR',
        message: exposeDetails
          ? details
          : 'Authentication failed. Verify that BETTER_AUTH_URL matches your deployment domain (for Factory, "https://careers.thefactoryhq.com") and redeploy.',
      },
    })
  }
})

async function enforceFactoryAuthPolicy(event: H3Event) {
  if (event.method !== 'POST') return

  const requestUrl = getRequestURL(event)
  const authPath = requestUrl.pathname
    .replace(/^\/api\/auth/, '')
    .replace(/\/+$/, '')

  if (env.FACTORY_DISABLE_PUBLIC_SIGNUP && authPath.startsWith('/sign-up')) {
    const body = await readBody<{ email?: unknown }>(event)
    const isAllowedDomainSignup = await isSignupEmailAllowedByOrgSettings(body?.email)
    if (isAllowedDomainSignup) return

    throw createError({
      statusCode: 403,
      statusMessage: 'Factory Careers account creation is invitation-only. Sign in with Microsoft or use an invitation link.',
    })
  }

  if (
    env.FACTORY_ADMIN_SSO_ONLY &&
    (
      authPath.startsWith('/sign-in/email') ||
      authPath.startsWith('/request-password-reset') ||
      authPath.startsWith('/forget-password') ||
      authPath.startsWith('/reset-password') ||
      authPath.startsWith('/change-password')
    )
  ) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Factory Careers admin access uses Microsoft SSO only.',
    })
  }

  if (
    env.FACTORY_DISABLE_PUBLIC_ORG_CREATION &&
    authPath.includes('/organization/create')
  ) {
    const session = await auth.api.getSession({ headers: event.headers })

    if (!session || !isFactoryInitialOwnerEmail(session.user.email)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Factory Careers uses a single Factory organization. Ask an administrator for an invitation.',
      })
    }
  }
}
