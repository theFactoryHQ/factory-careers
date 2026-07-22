import { hiringInboxNotificationSettingsSchema } from '~~/shared/application-notifications'
import { saveHiringInboxApplicationNotificationSettings } from '../../utils/applicationNotificationPreferences'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const settings = await readValidatedBody(event, hiringInboxNotificationSettingsSchema.parse)

  return saveHiringInboxApplicationNotificationSettings({
    organizationId: session.session.activeOrganizationId,
    settings,
  })
})
