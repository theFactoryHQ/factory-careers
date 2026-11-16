import { requireCronSecret } from '../../utils/cronAuth'
import { env } from '../../utils/env'
import { getMicrosoftCalendarAccountEmail, getMicrosoftConfig, isMicrosoftCalendarApplicationMode } from '../../utils/microsoft-calendar'
import { probeMicrosoftCalendarHealth } from '../../utils/microsoftCalendarHealth'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  requireCronSecret(getHeader(event, 'x-cron-secret'), env.CRON_SECRET)
  const config = getMicrosoftConfig()
  const expiry = env.MICROSOFT_CALENDAR_CREDENTIAL_EXPIRES_AT
  const parsed = expiry ? new Date(expiry) : null
  const result = await probeMicrosoftCalendarHealth(config && isMicrosoftCalendarApplicationMode() ? {
    ...config,
    mailbox: getMicrosoftCalendarAccountEmail(),
    expiresAt: parsed && Number.isFinite(parsed.getTime()) ? parsed : null,
  } : null)
  setResponseStatus(event, result.ok ? 200 : 503)
  return result
})
