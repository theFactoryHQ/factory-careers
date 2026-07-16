import { describe, expect, it, vi } from 'vitest'
import type { H3Event, EventHandlerRequest } from 'h3'

interface FakeEvent {
  socketIp: string
  headers: Record<string, string>
  responseHeaders: Record<string, string>
}

vi.stubGlobal('env', { TRUSTED_PROXY_IP: undefined })
vi.stubGlobal('getRequestIP', (event: FakeEvent) => event.socketIp)
vi.stubGlobal('getHeader', (event: FakeEvent, name: string) => event.headers[name.toLowerCase()])
vi.stubGlobal('setResponseHeaders', (event: FakeEvent, headers: Record<string, string | number>) => {
  for (const [name, value] of Object.entries(headers)) event.responseHeaders[name] = String(value)
})
vi.stubGlobal('setResponseHeader', (event: FakeEvent, name: string, value: string | number) => {
  event.responseHeaders[name] = String(value)
})
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string }) =>
  Object.assign(new Error(options.statusMessage), options),
)

const {
  buildAnalyticsClientRateLimitKey,
  createAnalyticsProxyRateLimitGuard,
} = await import('../../server/utils/analyticsProxyRateLimit')

function makeEvent(clientIp: string, socketIp = '10.0.0.5', headerName = 'cf-connecting-ip') {
  return {
    socketIp,
    headers: { [headerName]: clientIp },
    responseHeaders: {},
  } as unknown as FakeEvent & H3Event<EventHandlerRequest>
}

async function setup(options: {
  ingestionPerClient?: number
  ingestionGlobal?: number
  assetsPerClient?: number
  assetsGlobal?: number
} = {}) {
  return createAnalyticsProxyRateLimitGuard({
    windowMs: 60_000,
    ingestionPerClient: options.ingestionPerClient ?? 1,
    ingestionGlobal: options.ingestionGlobal ?? 100,
    assetsPerClient: options.assetsPerClient ?? 1,
    assetsGlobal: options.assetsGlobal ?? 100,
  })
}

describe('analytics proxy rate limits', () => {
  it('separates honest Cloudflare clients sharing one Render socket', async () => {
    const guard = await setup()
    const a = makeEvent('203.0.113.1')
    const b = makeEvent('203.0.113.2')

    await expect(guard(a, 'ingestion')).resolves.toBeUndefined()
    await expect(guard(b, 'ingestion')).resolves.toBeUndefined()
    await expect(guard(a, 'ingestion')).rejects.toMatchObject({ statusCode: 429 })
    await expect(guard(b, 'ingestion')).rejects.toMatchObject({ statusCode: 429 })
  })

  it('uses the first forwarded client when Cloudflare does not provide a hint', async () => {
    const guard = await setup()
    const a = makeEvent('203.0.113.10, 10.0.0.1', '10.0.0.5', 'x-forwarded-for')
    const b = makeEvent('203.0.113.11, 10.0.0.1', '10.0.0.5', 'x-forwarded-for')

    await expect(guard(a, 'assets')).resolves.toBeUndefined()
    await expect(guard(b, 'assets')).resolves.toBeUndefined()
  })

  it('bounds spoofed client hints with a higher global family cap', async () => {
    const guard = await setup({ ingestionPerClient: 10, ingestionGlobal: 2 })

    await expect(guard(makeEvent('203.0.113.1'), 'ingestion')).resolves.toBeUndefined()
    await expect(guard(makeEvent('203.0.113.2'), 'ingestion')).resolves.toBeUndefined()
    await expect(guard(makeEvent('203.0.113.3'), 'ingestion')).rejects.toMatchObject({ statusCode: 429 })
  })

  it('does not spend global allowance on requests already rejected by one client budget', async () => {
    const guard = await setup({ ingestionPerClient: 1, ingestionGlobal: 3 })
    const noisyClient = makeEvent('203.0.113.1')

    await expect(guard(noisyClient, 'ingestion')).resolves.toBeUndefined()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(guard(noisyClient, 'ingestion')).rejects.toMatchObject({ statusCode: 429 })
    }

    await expect(guard(makeEvent('203.0.113.2'), 'ingestion')).resolves.toBeUndefined()
    await expect(guard(makeEvent('203.0.113.3'), 'ingestion')).resolves.toBeUndefined()
    await expect(guard(makeEvent('203.0.113.4'), 'ingestion')).rejects.toMatchObject({ statusCode: 429 })
  })

  it('keeps ingestion and asset global backstops independent', async () => {
    const guard = await setup({
      ingestionPerClient: 10,
      ingestionGlobal: 1,
      assetsPerClient: 10,
      assetsGlobal: 1,
    })

    await expect(guard(makeEvent('203.0.113.1'), 'ingestion')).resolves.toBeUndefined()
    await expect(guard(makeEvent('203.0.113.1'), 'assets')).resolves.toBeUndefined()
    await expect(guard(makeEvent('203.0.113.2'), 'ingestion')).rejects.toMatchObject({ statusCode: 429 })
    await expect(guard(makeEvent('203.0.113.2'), 'assets')).rejects.toMatchObject({ statusCode: 429 })
  })

  it('rejects invalid or oversized client hints instead of expanding the key space', async () => {
    expect(buildAnalyticsClientRateLimitKey({
      socketIp: '10.0.0.5',
      cfConnectingIp: 'not-an-ip',
      forwardedFor: `${'1'.repeat(600)}, 203.0.113.7`,
    })).toBe('socket:10.0.0.5|client:unknown')
  })
})
