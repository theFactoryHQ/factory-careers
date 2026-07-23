import { getHiringInboxApplicationNotificationSettings } from '../../utils/applicationNotificationPreferences'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  return getHiringInboxApplicationNotificationSettings({
    organizationId: session.session.activeOrganizationId,
  })
})
