import { env } from './env'
import { logError } from './logger'

const ALERT_COOLDOWN_MS = 15 * 60 * 1000
const lastAlertedAt = new Map<string, Date>()
const inFlight = new Set<string>()

export function shouldDispatchCriticalAlert(
  previous: Date | null,
  now: Date,
  cooldownMs = ALERT_COOLDOWN_MS,
): boolean {
  return !previous || now.getTime() - previous.getTime() >= cooldownMs
}

export async function sendCriticalOperationalAlert(code: string): Promise<boolean> {
  const recipient = env.FACTORY_CAREERS_OPERATIONS_INBOX
  if (!recipient || inFlight.has(code)) return false
  const now = new Date()
  if (!shouldDispatchCriticalAlert(lastAlertedAt.get(code) ?? null, now)) return false

  inFlight.add(code)
  try {
    const { sendOperationalAlertEmail } = await import('./email')
    const sent = await sendOperationalAlertEmail({
      to: recipient,
      code,
      checkedAt: now.toISOString(),
    })
    if (sent) lastAlertedAt.set(code, now)
    return sent
  }
  catch {
    logError('operations.alert_send_failed', { result_code: 'provider_failure', alert_code: code })
    return false
  }
  finally {
    inFlight.delete(code)
  }
}
