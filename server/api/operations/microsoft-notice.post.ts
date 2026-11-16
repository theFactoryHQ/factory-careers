import { z } from 'zod'
import { requireCronSecret } from '../../utils/cronAuth'
import { env } from '../../utils/env'
import { sendOperationalAlertEmail } from '../../utils/email'

const microsoftNotice = z.object({
  issue: z.number().int().positive(),
  service: z.enum(['sso', 'calendar']),
  category: z.enum(['expiry', 'outage', 'configuration', 'monitor']),
  checkedAt: z.iso.datetime(),
})

const titles = {
  expiry: 'Expiry warning',
  outage: 'Outage',
  configuration: 'Credential configuration warning',
  monitor: 'Monitor unavailable',
}

const messages = {
  expiry: 'The Microsoft credential worked when checked and expires within 30 days.',
  outage: 'The production Microsoft check failed.',
  configuration: 'The monitor found missing or expired credential metadata.',
  monitor: 'The production check could not be reached or returned an unexpected response.',
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  requireCronSecret(getHeader(event, 'x-cron-secret'), env.CRON_SECRET)
  const { issue, service, category, checkedAt } = await readValidatedBody(event, microsoftNotice.parse)
  if (Date.now() - Date.parse(checkedAt) >= 23 * 3_600_000) {
    throw createError({ statusCode: 409, statusMessage: 'Notice delivery requires reconciliation' })
  }
  const recipient = env.FACTORY_CAREERS_MICROSOFT_ALERT_EMAIL || env.FACTORY_CAREERS_OPERATIONS_INBOX
  if (!recipient) throw createError({ statusCode: 503, statusMessage: 'Operations recipient missing' })
  const name = service === 'sso' ? 'Microsoft sign-in' : 'Outlook interview calendar'
  const heading = titles[category] + ' · Factory Careers ' + name
  const sent = await sendOperationalAlertEmail({
    to: recipient,
    code: category,
    checkedAt,
    notice: { heading, body: messages[category] },
    idempotencyKey: 'factory-careers-microsoft-issue-' + issue,
  })
  if (!sent) throw createError({ statusCode: 503, statusMessage: 'Notice delivery failed' })
  return { ok: true }
})
