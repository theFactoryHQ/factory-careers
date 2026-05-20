import { and, eq } from 'drizzle-orm'
import { member, organization } from '../database/schema'

export function normalizeFactoryEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? ''
}

export function getFactoryEmailDomain(email: string | null | undefined): string {
  const normalized = normalizeFactoryEmail(email)
  const [, domain = ''] = normalized.split('@')
  return domain
}

export function isFactoryAllowedDomainEmail(email: string | null | undefined): boolean {
  const domain = getFactoryEmailDomain(email)
  return !!domain && env.FACTORY_ALLOWED_EMAIL_DOMAINS.includes(domain)
}

export function isFactoryInitialOwnerEmail(email: string | null | undefined): boolean {
  const normalized = normalizeFactoryEmail(email)
  return !!normalized && env.FACTORY_INITIAL_OWNER_EMAILS.includes(normalized)
}

export function isFactoryStaffSignupEmail(email: string | null | undefined): boolean {
  return isFactoryAllowedDomainEmail(email) || isFactoryInitialOwnerEmail(email)
}

export async function assertFactoryStaffAccess(params: {
  userId: string
  email: string
  activeOrganizationId: string
}): Promise<void> {
  const activeOrg = await db.query.organization.findFirst({
    where: eq(organization.id, params.activeOrganizationId),
    columns: { id: true, slug: true },
  })

  if (!activeOrg || activeOrg.slug !== env.FACTORY_ORG_SLUG) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Factory Careers staff access is limited to the Factory organization.',
    })
  }

  const activeMember = await db.query.member.findFirst({
    where: and(
      eq(member.userId, params.userId),
      eq(member.organizationId, params.activeOrganizationId),
    ),
    columns: { id: true },
  })

  if (!activeMember) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Factory Careers access requires an invitation or administrator approval.',
    })
  }
}
