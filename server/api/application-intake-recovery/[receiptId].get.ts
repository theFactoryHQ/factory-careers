import { loadOwnedApplicationIntakeReceipt } from '../../utils/applicationIntakeRecoveryAuthorization'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const session = await requirePermission(event, { organization: ['delete'] })
  if (!env.APPLICATION_INTAKE_RECOVERY_ENABLED) {
    throw createError({ statusCode: 503, statusMessage: 'Application intake recovery is disabled' })
  }
  const receiptId = getRouterParam(event, 'receiptId') ?? ''
  const loaded = await loadOwnedApplicationIntakeReceipt(receiptId, session.session.activeOrganizationId)
  return {
    receipt: {
      receiptId,
      createdAt: loaded.encrypted.createdAt,
      expiresAt: loaded.encrypted.expiresAt,
      keyId: loaded.encrypted.keyId,
    },
  }
})
