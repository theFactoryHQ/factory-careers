import { and, eq, or, sql } from 'drizzle-orm'
import { calendarIntegration, member, orgSettings, ssoProvider } from '../database/schema'

const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export function normalizeSignupAllowedDomains(domains: unknown): string[] {
  if (!Array.isArray(domains)) return []

  const normalized = domains
    .filter((domain): domain is string => typeof domain === 'string')
    .map(domain => domain.trim().toLowerCase().replace(/^@+/, '').replace(/\.$/, ''))
    .filter(domain => domain.length <= 253 && DOMAIN_PATTERN.test(domain))

  return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b))
}

export function extractSignupEmailDomain(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const normalized = email.trim().toLowerCase()
  const atIndex = normalized.lastIndexOf('@')
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null
  const domain = normalized.slice(atIndex + 1)
  return DOMAIN_PATTERN.test(domain) ? domain : null
}

export function isSignupEmailDomainAllowed(email: unknown, allowedDomains: unknown): boolean {
  const domain = extractSignupEmailDomain(email)
  if (!domain) return false
  return normalizeSignupAllowedDomains(allowedDomains).includes(domain)
}

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

export async function isSignupEmailAllowedByOrgSettings(email: unknown): Promise<boolean> {
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

  const ssoProviders = await db.query.ssoProvider.findMany({
    where: eq(ssoProvider.organizationId, options.organizationId),
    columns: {
      domain: true,
    },
  })

  const calendarIntegrations = await db.query.calendarIntegration.findMany({
    where: or(
      eq(calendarIntegration.organizationId, options.organizationId),
      eq(calendarIntegration.userId, options.actorUserId),
    ),
    columns: {
      accountEmail: true,
    },
  })

  const verifiedDomains = new Set([
    ...ssoProviders.map(provider => provider.domain.toLowerCase()),
    ...calendarIntegrations
      .map(integration => emailDomain(integration.accountEmail))
      .filter((domain): domain is string => !!domain),
  ])

  const unverifiedDomain = domains.find(domain => !verifiedDomains.has(domain))

  if (unverifiedDomain) {
    throw createError({
      statusCode: 422,
      statusMessage: `Domain "${unverifiedDomain}" must match a configured SSO provider or connected calendar account before it can be allowlisted.`,
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
