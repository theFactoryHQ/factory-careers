import { eq } from 'drizzle-orm'
import { member, session as sessionTable } from '../database/schema'

type SessionWithOptionalActiveOrg = {
  user: {
    id: string
  }
  session: {
    id?: string
    token?: string
    activeOrganizationId?: string | null
  }
}

export async function resolveActiveOrganizationId(
  authSession: SessionWithOptionalActiveOrg,
): Promise<string | null> {
  if (authSession.session.activeOrganizationId) {
    return authSession.session.activeOrganizationId
  }

  const memberships = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, authSession.user.id))
    .limit(2)

  if (memberships.length !== 1) {
    return null
  }

  const activeOrganizationId = memberships[0]?.organizationId
  if (!activeOrganizationId) {
    return null
  }

  if (authSession.session.id) {
    await db
      .update(sessionTable)
      .set({ activeOrganizationId, updatedAt: new Date() })
      .where(eq(sessionTable.id, authSession.session.id))
  }
  else if (authSession.session.token) {
    await db
      .update(sessionTable)
      .set({ activeOrganizationId, updatedAt: new Date() })
      .where(eq(sessionTable.token, authSession.session.token))
  }
  else {
    return null
  }

  return activeOrganizationId
}
