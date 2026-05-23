/**
 * POST /api/calendar/renew-webhooks
 *
 * Renew expiring Google Calendar webhook channels.
 * Should be called periodically (e.g., daily cron) to ensure two-way sync
 * stays active. Google channels expire after ~7 days.
 *
 * This is an internal endpoint — only callable by authenticated admins/owners.
 */
import { lt, and, isNotNull } from 'drizzle-orm'
import { calendarIntegration } from '../../database/schema'
import { setupCalendarWebhook } from '../../utils/google-calendar'
import { timingSafeStringEqual } from '../../utils/secureCompare'

export default defineEventHandler(async (event) => {
  // Check for CRON_SECRET header (server-to-server / scheduled job)
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (cronSecret && env.CRON_SECRET) {
    if (!timingSafeStringEqual(cronSecret, env.CRON_SECRET)) {
      throw createError({ statusCode: 403, statusMessage: 'Invalid cron secret' })
    }
  }
  else {
    // Interactive user — require authentication + admin-level permission
    await requirePermission(event, { interview: ['update'] })
  }

  // Find all integrations with webhooks expiring within the next 24 hours
  const expirationThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const expiring = await db.query.calendarIntegration.findMany({
    where: and(
      isNotNull(calendarIntegration.webhookChannelId),
      lt(calendarIntegration.webhookExpiration, expirationThreshold),
    ),
    columns: { userId: true },
  })

  let renewed = 0
  let failed = 0

  for (const integration of expiring) {
    if (!integration.userId) {
      failed++
      continue
    }
    try {
      const success = await setupCalendarWebhook(integration.userId)
      if (success) renewed++
      else failed++
    }
    catch {
      failed++
    }
  }

  return {
    total: expiring.length,
    renewed,
    failed,
  }
})
