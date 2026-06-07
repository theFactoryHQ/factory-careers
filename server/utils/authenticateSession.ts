import type { H3Event } from 'h3'
import { resolveActiveOrganizationId } from './activeOrganization'
import { assertFactoryStaffAccess } from './factoryAccess'

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>

export type AuthSessionWithActiveOrg = Omit<AuthSession, 'session'> & {
  session: AuthSession['session'] & {
    activeOrganizationId: string
  }
}

/**
 * Authenticate the request, resolve the active organization, and enforce
 * Factory staff access. Shared by requireAuth and requirePermission.
 */
export async function authenticateWithActiveOrg(event: H3Event): Promise<AuthSessionWithActiveOrg> {
  const session = await auth.api.getSession({
    headers: event.headers,
  })

  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const activeOrganizationId = await resolveActiveOrganizationId(session)

  if (!activeOrganizationId) {
    throw createError({ statusCode: 403, statusMessage: 'No active organization' })
  }

  await assertFactoryStaffAccess({
    userId: session.user.id,
    email: session.user.email,
    activeOrganizationId,
  })

  return {
    ...session,
    session: {
      ...session.session,
      activeOrganizationId,
    },
  } as AuthSessionWithActiveOrg
}