import { eq, and, ne } from 'drizzle-orm'
import { ssoProvider } from '~~/server/database/schema'
import {
  discoverOidcRegistrationConfig,
  registerSsoSchema,
} from '~~/server/utils/ssoSecurity'

function getOidcScopesForIssuer(issuer: string): string[] {
  const scopes = ['openid', 'email', 'profile']
  try {
    const hostname = new URL(issuer).hostname.toLowerCase()
    if (hostname === 'login.microsoftonline.com' || hostname === 'sts.windows.net') {
      scopes.push('User.Read')
    }
  } catch {
    // Validation has already checked issuer shape; keep default scopes here.
  }
  return scopes
}

/**
 * POST /api/sso/providers — register an OIDC SSO provider for the current org.
 * Uses Better Auth's SSO plugin under the hood.
 * Only org owners/admins can register providers.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId

  const body = await readValidatedBody(event, registerSsoSchema.parse)

  // Prevent domain hijacking: reject if another org already registered this domain
  const existingDomain = await db
    .select({ id: ssoProvider.id })
    .from(ssoProvider)
    .where(and(eq(ssoProvider.domain, body.domain), ne(ssoProvider.organizationId, orgId)))
    .limit(1)

  if (existingDomain.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This email domain is already registered by another organization.',
    })
  }

  // Prevent provider ID collision: reject if providerId already exists
  const existingProvider = await db
    .select({ id: ssoProvider.id })
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, body.providerId))
    .limit(1)

  if (existingProvider.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A provider with this ID already exists. Choose a different provider ID.',
    })
  }

  try {
    const discoveredOidcConfig = await discoverOidcRegistrationConfig(body.issuer, {
      allowLocalHttp: process.env.NODE_ENV !== 'production',
    })

    const result = await (auth.api as any).registerSSOProvider({
      headers: event.headers,
      body: {
        providerId: body.providerId,
        issuer: body.issuer,
        domain: body.domain,
        organizationId: orgId,
        oidcConfig: {
          clientId: body.clientId,
          clientSecret: body.clientSecret,
          ...discoveredOidcConfig,
          scopes: getOidcScopesForIssuer(body.issuer),
          pkce: true,
        },
      },
    })

    setResponseStatus(event, 201)
    return {
      id: result.id,
      providerId: result.providerId,
      issuer: result.issuer,
      domain: result.domain,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to register SSO provider'

    // Map Better Auth discovery errors to user-friendly messages
    if (message.includes('discovery_not_found')) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Could not reach the OIDC discovery endpoint. Verify the issuer URL is correct.',
      })
    }
    if (message.includes('discovery_timeout')) {
      throw createError({
        statusCode: 422,
        statusMessage: 'The identity provider did not respond in time. Please try again.',
      })
    }
    if (message.includes('issuer_mismatch')) {
      throw createError({
        statusCode: 422,
        statusMessage: 'The issuer in the discovery document does not match the provided issuer URL.',
      })
    }

    throw createError({ statusCode: 400, statusMessage: message })
  }
})
