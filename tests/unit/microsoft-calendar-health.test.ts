import { describe, expect, it, vi } from 'vitest'
import { probeMicrosoftCalendarHealth } from '../../server/utils/microsoftCalendarHealth'

const now = new Date('2026-11-13T00:00:00Z')
const config = {
  tenantId: 'factory-tenant', clientId: 'calendar-app', clientSecret: 'concealed-secret',
  mailbox: 'interviews@example.com', expiresAt: new Date('2026-12-01T00:00:00Z'),
}

describe('Outlook calendar health', () => {
  it('checks access to the shared Outlook calendar before reporting an expiry warning', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'private-token' }))
      .mockResolvedValueOnce(Response.json({ canEdit: true }))
    expect(await probeMicrosoftCalendarHealth(config, request, now)).toEqual({
      ok: true, code: 'expires_30d', checkedAt: now.toISOString(),
    })
    expect(request.mock.calls[1]?.[0]).toContain('/users/interviews%40example.com/calendar')
    expect(JSON.stringify(request.mock.results)).not.toContain(config.clientSecret)
  })

  it('reports an Exchange timeout separately from expiry', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'private-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
    expect(await probeMicrosoftCalendarHealth(config, request, now)).toMatchObject({
      ok: false, code: 'transient_failure',
    })
  })

  it('reports rejected credentials before attempting Outlook', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({ error: 'invalid_client', error_description: 'private detail' }, { status: 401 }),
    )
    expect(await probeMicrosoftCalendarHealth(config, request, now))
      .toEqual({ ok: false, code: 'invalid_client', checkedAt: now.toISOString() })
    expect(request).toHaveBeenCalledOnce()
  })
})
