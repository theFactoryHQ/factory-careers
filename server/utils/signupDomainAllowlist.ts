import { and, eq, isNull, sql } from 'drizzle-orm'
import { calendarIntegration, member, orgSettings, ssoProvider } from '../database/schema'
export {
  extractSignupEmailDomain,
  isSignupEmailDomainAllowed,
  normalizeSignupAllowedDomains,
} from '~~/shared/signup-domains'
import {
  extractSignupEmailDomain,
  isCommonConsumerEmailDomain,
  normalizeSignupAllowedDomains,
  normalizeSignupDomain,
} from '~~/shared/signup-domains'

function emailDomain(value: string | null | undefined): string | null {
  if (!value) return null
  return extractSignupEmailDomain(value)
}

export function hasPostgresErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ('code' in error && error.code === code) return true
  if ('cause' in error) return hasPostgresErrorCode(error.cause, code)
  return false
}

export async function isSignupEmailAllowedByAnyOrgAllowlist(email: unknown): Promise<boolean> {
  const domain = extractSignupEmailDomain(email)
  if (!domain) return false

  try {
    const [match] = await db
      .select({ id: orgSettings.id })
      .from(orgSettings)
      .where(sql`${orgSettings.signupAllowedDomains} ? ${domain}`)
      .limit(1)

    return !!match
  }
  catch (error) {
    if (hasPostgresErrorCode(error, '42703')) return false
    throw error
  }
}

export async function assertSignupDomainAllowlistUpdateAllowed(options: {
  actorUserId: string
  organizationId: string
  domains: string[]
}) {
  const domains = normalizeSignupAllowedDomains(options.domains)

  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, options.actorUserId),
        eq(member.organizationId, options.organizationId),
      ),
    )
    .limit(1)

  if (membership?.role !== 'owner') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only organization owners can manage signup domain allowlists.',
    })
  }

  if (domains.length === 0) return

  const consumerDomain = domains.find(isCommonConsumerEmailDomain)
  if (consumerDomain) {
    throw createError({
      statusCode: 422,
      statusMessage: `Domain "${consumerDomain}" is a common consumer email provider and cannot be allowlisted.`,
    })
  }

  const ssoProviders = await db.query.ssoProvider.findMany({
    where: eq(ssoProvider.organizationId, options.organizationId),
    columns: {
      domain: true,
    },
  })

  const calendarIntegrations = await db.query.calendarIntegration.findMany({
    where: and(
      eq(calendarIntegration.organizationId, options.organizationId),
      isNull(calendarIntegration.userId),
    ),
    columns: {
      accountEmail: true,
    },
  })

  const verifiedDomains = new Set([
    ...ssoProviders
      .map(provider => normalizeSignupDomain(provider.domain))
      .filter((domain): domain is string => !!domain),
    ...calendarIntegrations
      .map(integration => emailDomain(integration.accountEmail))
      .filter((domain): domain is string => !!domain),
  ])

  const unverifiedDomain = domains.find(domain => !verifiedDomains.has(domain))

  if (unverifiedDomain) {
    throw createError({
      statusCode: 422,
      statusMessage: `Domain "${unverifiedDomain}" must match a configured SSO provider or organization-level calendar integration before it can be allowlisted.`,
    })
  }
}

export async function getOrgSignupAllowedDomains(organizationId: string): Promise<string[]> {
  const settings = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.organizationId, organizationId),
    columns: { signupAllowedDomains: true },
  })

  return normalizeSignupAllowedDomains(settings?.signupAllowedDomains ?? [])
}
