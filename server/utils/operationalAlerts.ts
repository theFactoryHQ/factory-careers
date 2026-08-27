import { env } from './env'
import { logError } from './logger'

const ALERT_COOLDOWN_MS = 15 * 60 * 1000
const FAILED_ALERT_COOLDOWN_MS = 60 * 1000
const lastAlertedAt = new Map<string, Date>()
const inFlight = new Set<string>()
const PUBLIC_APPLY_PATH = /^\/api\/public\/jobs\/[^/]+\/apply$/

export function isExpectedHealthCheckUnready(
  path: string,
  statusCode: number | undefined,
): boolean {
  return path === '/api/readyz' && statusCode === 503
}

export function criticalHttpErrorAlertCode(
  path: string,
  statusCode: number | undefined,
): string | undefined {
  const status = statusCode ?? 500
  if (status < 500) return undefined
  // /api/readyz 503 is the intended Render health-check signal while a new
  // instance is still starting. Do not page for that path at all: persistent
  // unreadiness is covered by the public-path monitor and dedicated startup
  // alerts (`migration.startup_failed`, `storage.startup_failed`).
  if (path === '/api/readyz') return undefined
  if (PUBLIC_APPLY_PATH.test(path)) return 'application.request_failed'
  return undefined
}

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
    lastAlertedAt.set(
      code,
      sent ? now : new Date(now.getTime() - ALERT_COOLDOWN_MS + FAILED_ALERT_COOLDOWN_MS),
    )
    return sent
  }
  catch {
    lastAlertedAt.set(code, new Date(now.getTime() - ALERT_COOLDOWN_MS + FAILED_ALERT_COOLDOWN_MS))
    logError('operations.alert_send_failed', { result_code: 'provider_failure', alert_code: code })
    return false
  }
  finally {
    inFlight.delete(code)
  }
}
