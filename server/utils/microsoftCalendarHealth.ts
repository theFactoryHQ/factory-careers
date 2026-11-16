import { microsoftCredentialExpiryCode, type MicrosoftSsoHealthCode } from './microsoftSsoHealth'

type CalendarHealthCode = MicrosoftSsoHealthCode | 'calendar_access_denied' | 'disabled'
type CalendarProbeConfig = {
  tenantId: string
  clientId: string
  clientSecret: string
  mailbox: string
  expiresAt: Date | null
}

export async function probeMicrosoftCalendarHealth(config: CalendarProbeConfig | null, request = fetch, now = new Date()) {
  function result(code: CalendarHealthCode) {
    return { ok: code === 'healthy' || code === 'disabled' || code.startsWith('expires_'), code, checkedAt: now.toISOString() }
  }
  if (!config) return result('disabled')
  try {
    const endpoint = 'https://login.microsoftonline.com/' + encodeURIComponent(config.tenantId) + '/oauth2/v2.0/token'
    const tokenResponse = await request(endpoint, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.clientId, client_secret: config.clientSecret,
        grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default',
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(9_000),
    })
    const token = await tokenResponse.json()
    if (!tokenResponse.ok) {
      return result(['invalid_client', 'unauthorized_client'].includes(token?.error) ? 'invalid_client' : 'transient_failure')
    }
    if (typeof token?.access_token !== 'string' || !token.access_token) return result('transient_failure')

    const mailbox = await request('https://graph.microsoft.com/v1.0/users/'
      + encodeURIComponent(config.mailbox) + '/calendar?$select=canEdit', {
      headers: { authorization: 'Bearer ' + token.access_token },
      redirect: 'error',
      signal: AbortSignal.timeout(9_000),
    })
    if ([401, 403, 404].includes(mailbox.status)) return result('calendar_access_denied')
    if (!mailbox.ok) return result('transient_failure')
    if ((await mailbox.json())?.canEdit !== true) return result('calendar_access_denied')
    if (!config.expiresAt) return result('metadata_missing')
    return result(microsoftCredentialExpiryCode(config.expiresAt, now) ?? 'healthy')
  } catch {
    return result('transient_failure')
  }
}
