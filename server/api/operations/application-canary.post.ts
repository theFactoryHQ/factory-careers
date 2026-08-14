import { cleanupApplicationCanary } from '../../utils/cleanupApplicationCanary'
import { executeApplicationCanary } from '../../utils/applicationCanary'
import { requireCronSecret } from '../../utils/cronAuth'
import { resolveFactoryCareersBaseUrl } from '../../utils/baseUrl'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  requireCronSecret(getHeader(event, 'x-cron-secret'), env.CRON_SECRET)
  if (!env.FACTORY_CAREERS_CANARY_ENABLED) {
    throw createError({ statusCode: 503, statusMessage: 'Application canary is disabled' })
  }

  const email = `factory-careers-canary+${Date.now().toString(36)}@example.com`
  let response: { ok: true, code: 'application_canary_passed' } | undefined
  let failure: unknown
  try {
    response = await executeApplicationCanary({
      baseUrl: resolveFactoryCareersBaseUrl(),
      slug: env.FACTORY_CAREERS_CANARY_JOB_SLUG,
      secret: env.CRON_SECRET!,
      email,
    })
  }
  catch (error) {
    failure = error
  }

  const cleanup = await cleanupApplicationCanary(email)
  if (failure || !response || !cleanup.ok) {
    logError('application.canary_failed', {
      result_code: cleanup.ok ? 'submission_failed' : 'cleanup_failed',
    })
    await sendCriticalOperationalAlert('application.canary_failed')
    throw createError({ statusCode: 503, statusMessage: 'Application canary failed' })
  }

  logInfo('application.canary_passed', { result_code: response.code })
  return { ok: true, code: 'healthy' }
})
