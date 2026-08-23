import type { H3Event } from 'h3'

export function isInstanceAdminUserId(
  userId: string | null | undefined,
  allowedUserIds: ReadonlySet<string> = env.FACTORY_INSTANCE_ADMIN_USER_IDS,
): boolean {
  return typeof userId === 'string'
    && userId.length > 0
    && allowedUserIds.has(userId)
}

export async function requireInstanceAdmin(event: H3Event) {
  const session = await requireAuth(event)

  if (!isInstanceAdminUserId(session.user.id)) {
    logWarn('instance_admin.access_denied', {
      result_code: 'user_not_allowlisted',
    })
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: instance administrator access required',
    })
  }

  return session
}
