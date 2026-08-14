import { purgeExpiredOwnedApplicationIntakeReceipts } from '../../utils/applicationIntakeRecoveryAuthorization'
import { recordActivity } from '../../utils/recordActivity'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const session = await requirePermission(event, { organization: ['delete'] })
  if (!env.APPLICATION_INTAKE_RECOVERY_ENABLED) {
    throw createError({ statusCode: 503, statusMessage: 'Application intake recovery is disabled' })
  }
  const result = await purgeExpiredOwnedApplicationIntakeReceipts(session.session.activeOrganizationId)
  await recordActivity({
    organizationId: session.session.activeOrganizationId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'application_intake_recovery',
    resourceId: 'expired',
    metadata: result,
  })
  return { success: true, ...result }
})
