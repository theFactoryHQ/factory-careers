import { purgeExpiredApplicationIntakeReceipts } from '../../utils/applicationIntakeRecoveryOperations'
import { parseApplicationIntakeKeyring } from '../../utils/applicationIntakeRecovery'
import { requireCronSecret } from '../../utils/cronAuth'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  requireCronSecret(getHeader(event, 'x-cron-secret'), env.CRON_SECRET)
  if (!env.APPLICATION_INTAKE_RECOVERY_ENABLED) {
    return { ok: true, code: 'disabled', scanned: 0, purged: 0, failed: 0 }
  }
  const result = await purgeExpiredApplicationIntakeReceipts({
    keyring: parseApplicationIntakeKeyring(env.APPLICATION_INTAKE_KEYRING!),
  })
  logInfo('application.intake_expired_purged', result)
  return {
    ok: result.failed === 0,
    code: result.failed === 0 ? 'healthy' : 'purge_partial_failure',
    ...result,
  }
})
