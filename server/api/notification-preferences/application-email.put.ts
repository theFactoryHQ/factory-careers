import { applicationNotificationPreferenceSchema } from '~~/shared/application-notifications'
import { savePersonalApplicationNotificationPreference } from '../../utils/applicationNotificationPreferences'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const preference = await readValidatedBody(event, applicationNotificationPreferenceSchema.parse)

  return savePersonalApplicationNotificationPreference({
    organizationId: session.session.activeOrganizationId,
    userId: session.user.id,
    preference,
  })
})
