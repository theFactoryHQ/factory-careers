import { deleteApplicationIntakeReceipt, isApplicationIntakeReceiptExpired } from '../../../utils/applicationIntakeRecovery'
import { loadOwnedApplicationIntakeReceipt } from '../../../utils/applicationIntakeRecoveryAuthorization'
import { replayApplicationIntakeEnvelope } from '../../../utils/applicationIntakeRecoveryOperations'
import { prepareApplicationIntakeReplay } from '../../../utils/applicationIntakeReplayState'
import { resolveFactoryCareersBaseUrl } from '../../../utils/baseUrl'
import { recordActivity } from '../../../utils/recordActivity'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const session = await requirePermission(event, { organization: ['delete'] })
  if (!env.APPLICATION_INTAKE_RECOVERY_ENABLED) {
    throw createError({ statusCode: 503, statusMessage: 'Application intake recovery is disabled' })
  }
  const receiptId = getRouterParam(event, 'receiptId') ?? ''
  const loaded = await loadOwnedApplicationIntakeReceipt(receiptId, session.session.activeOrganizationId)
  if (isApplicationIntakeReceiptExpired(loaded.encrypted)) {
    throw createError({ statusCode: 410, statusMessage: 'Recovery receipt has expired' })
  }
  const replayState = await prepareApplicationIntakeReplay({
    organizationId: session.session.activeOrganizationId,
    receiptId,
  })
  const result = replayState.outcome === 'already_completed'
    ? { outcome: 'already_completed' as const }
    : await replayApplicationIntakeEnvelope(loaded.envelope, {
        baseUrl: resolveFactoryCareersBaseUrl(),
        secret: env.CRON_SECRET!,
        receiptId,
      })
  await deleteApplicationIntakeReceipt({ storageKey: loaded.storageKey })
  await recordActivity({
    organizationId: session.session.activeOrganizationId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'application_intake_recovery',
    resourceId: receiptId,
    metadata: { outcome: result.outcome, keyId: loaded.encrypted.keyId },
  })
  return { success: true, receiptId, outcome: result.outcome }
})
