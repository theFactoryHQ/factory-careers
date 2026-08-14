import { listOwnedApplicationIntakeReceipts } from '../../utils/applicationIntakeRecoveryAuthorization'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const session = await requirePermission(event, { organization: ['delete'] })
  if (!env.APPLICATION_INTAKE_RECOVERY_ENABLED) {
    throw createError({ statusCode: 503, statusMessage: 'Application intake recovery is disabled' })
  }
  const receipts = await listOwnedApplicationIntakeReceipts(session.session.activeOrganizationId)
  return { receipts }
})
