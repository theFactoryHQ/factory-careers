import { getPersonalApplicationNotificationPreference } from '../../utils/applicationNotificationPreferences'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  return getPersonalApplicationNotificationPreference({
    organizationId: session.session.activeOrganizationId,
    userId: session.user.id,
  })
})
