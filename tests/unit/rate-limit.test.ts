import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { H3Event, EventHandlerRequest } from 'h3'

// ── Stub Nitro auto-imports BEFORE importing the module under test ───────────
// rateLimit.ts reads these globals lazily inside the returned closure, so
// stubbing them at top level (before the dynamic import) is enough.

interface FakeEvent {
  __ip: string
  __headers: Record<string, string>
  __resHeaders: Record<string, string>
}

const envStub = {
  TRUST_PROXY_HEADERS: false,
  TRUSTED_PROXY_IP: undefined as string | undefined,
}

vi.stubGlobal('env', envStub)
vi.stubGlobal(
  'getRequestIP',
  (event: FakeEvent, options?: { xForwardedFor?: boolean }) => {
    if (options?.xForwardedFor) {
      return event.__headers['x-forwarded-for']
        ?.split(',')[0]
        ?.trim() || event.__ip
    }
    return event.__ip
  },
)
vi.stubGlobal('getHeader', (event: FakeEvent, name: string) => event.__headers[name.toLowerCase()])
vi.stubGlobal('setResponseHeaders', (event: FakeEvent, headers: Record<string, string | number>) => {
  for (const [k, v] of Object.entries(headers)) event.__resHeaders[k] = String(v)
})
vi.stubGlobal('setResponseHeader', (event: FakeEvent, name: string, value: string | number) => {
  event.__resHeaders[name] = String(value)
})
vi.stubGlobal('createError', (opts: { statusCode: number, statusMessage?: string }) => {
  const err = new Error(opts.statusMessage ?? 'error') as Error & { statusCode: number, statusMessage?: string }
  err.statusCode = opts.statusCode
  err.statusMessage = opts.statusMessage
  return err
})

const { createRateLimiter } = await import('../../server/utils/rateLimit')
const { readPositiveIntegerEnv } = await import('../../server/utils/rateLimitConfig')
const { envSchema } = await import('../../server/utils/env')
const TEST_RATE_LIMIT_ENV = 'REQCORE_TEST_RATE_LIMIT_MAX_REQUESTS'

function makeEvent(ip = '1.2.3.4', headers: Record<string, string> = {}): FakeEvent & H3Event<EventHandlerRequest> {
  return { __ip: ip, __headers: headers, __resHeaders: {} } as unknown as FakeEvent & H3Event<EventHandlerRequest>
}

beforeEach(() => {
  envStub.TRUST_PROXY_HEADERS = false
  envStub.TRUSTED_PROXY_IP = undefined
  delete process.env[TEST_RATE_LIMIT_ENV]
})

afterEach(() => {
  delete process.env[TEST_RATE_LIMIT_ENV]
})

describe('createRateLimiter', () => {
  it('admits requests up to maxRequests and blocks the next one', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 })
    const event = makeEvent()

    await limiter(event)
    await limiter(event)
    await limiter(event)

    await expect(limiter(event)).rejects.toMatchObject({ statusCode: 429 })
  })

  it('isolates buckets per IP — one user blocked does not block another', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 })
    const a = makeEvent('10.0.0.1')
    const b = makeEvent('10.0.0.2')

    await limiter(a)
    await limiter(a)
    await expect(limiter(a)).rejects.toMatchObject({ statusCode: 429 })

    // Different IP — fresh bucket, must succeed.
    await expect(limiter(b)).resolves.toBeUndefined()
    await expect(limiter(b)).resolves.toBeUndefined()
  })

  it('isolates buckets per limiter instance — separate routes never share counters', async () => {
    // Each createRateLimiter() call builds its own Map, so two limiters with
    // identical window/max still have independent state.
    const a = createRateLimiter({ windowMs: 60_000, maxRequests: 1 })
    const b = createRateLimiter({ windowMs: 60_000, maxRequests: 1 })
    const ip = makeEvent('5.5.5.5')

    await a(ip)
    await expect(a(ip)).rejects.toMatchObject({ statusCode: 429 })

    // Same IP, same params, different limiter — must still be admitted.
    await expect(b(ip)).resolves.toBeUndefined()
  })

  it('supports an explicit bounded key resolver without weakening the secure default', async () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      keyResolver: event => (event as unknown as FakeEvent).__headers['x-client-key'],
    })
    const sharedSocketA = makeEvent('10.0.0.5', { 'x-client-key': 'client-a' })
    const sharedSocketB = makeEvent('10.0.0.5', { 'x-client-key': 'client-b' })

    await expect(limiter(sharedSocketA)).resolves.toBeUndefined()
    await expect(limiter(sharedSocketB)).resolves.toBeUndefined()
    await expect(limiter(sharedSocketA)).rejects.toMatchObject({ statusCode: 429 })
  })

  it('collapses excess custom keys into a bounded overflow bucket', async () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      maxTrackedKeys: 1,
      keyResolver: event => (event as unknown as FakeEvent).__headers['x-client-key'],
    })

    await expect(limiter(makeEvent('10.0.0.5', { 'x-client-key': 'client-a' }))).resolves.toBeUndefined()
    await expect(limiter(makeEvent('10.0.0.5', { 'x-client-key': 'client-b' }))).resolves.toBeUndefined()
    await expect(limiter(makeEvent('10.0.0.5', { 'x-client-key': 'client-c' }))).rejects.toMatchObject({ statusCode: 429 })
  })

  it('reclaims expired dedicated keys before assigning new clients to overflow', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'))
      const limiter = createRateLimiter({
        windowMs: 1_000,
        maxRequests: 1,
        maxTrackedKeys: 1,
        keyResolver: event => (event as unknown as FakeEvent).__headers['x-client-key'],
      })

      await limiter(makeEvent('10.0.0.5', { 'x-client-key': 'client-a' }))
      await limiter(makeEvent('10.0.0.5', { 'x-client-key': 'client-b' }))
      await expect(limiter(makeEvent('10.0.0.5', { 'x-client-key': 'client-c' })))
        .rejects.toMatchObject({ statusCode: 429 })

      vi.setSystemTime(new Date('2026-07-16T12:00:01.001Z'))
      await expect(limiter(makeEvent('10.0.0.5', { 'x-client-key': 'client-c' }))).resolves.toBeUndefined()
      await expect(limiter(makeEvent('10.0.0.5', { 'x-client-key': 'client-d' }))).resolves.toBeUndefined()
      await expect(limiter(makeEvent('10.0.0.5', { 'x-client-key': 'client-e' })))
        .rejects.toMatchObject({ statusCode: 429 })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('emits standard rate-limit headers on every response', async () => {
    // Note: `remaining` is computed BEFORE recording the current request, so
    // the first call sees `maxRequests` remaining (the response describes the
    // pre-request budget, not the post-request budget). Subsequent calls see
    // the slot consumed by the previous request.
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 })
    const event1 = makeEvent('1.1.1.1')
    const event2 = makeEvent('1.1.1.1')

    await limiter(event1)
    expect(event1.__resHeaders['X-RateLimit-Limit']).toBe('5')
    expect(event1.__resHeaders['X-RateLimit-Remaining']).toBe('5')
    expect(Number(event1.__resHeaders['X-RateLimit-Reset'])).toBeGreaterThan(0)

    await limiter(event2)
    expect(event2.__resHeaders['X-RateLimit-Remaining']).toBe('4')
  })

  it('sets Retry-After when the limit is exceeded', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 })
    const event = makeEvent()
    await limiter(event)

    await expect(limiter(event)).rejects.toMatchObject({ statusCode: 429 })
    expect(event.__resHeaders['Retry-After']).toBeDefined()
    expect(Number(event.__resHeaders['Retry-After'])).toBeGreaterThan(0)
  })

  it('uses the custom error message when provided', async () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      message: 'Slow down, partner.',
    })
    const event = makeEvent()
    await limiter(event)

    await expect(limiter(event)).rejects.toMatchObject({
      statusCode: 429,
      statusMessage: 'Slow down, partner.',
    })
  })

  it('admits a new request once the oldest timestamp falls out of the window', async () => {
    // Advance time so the original timestamps age past windowMs without us
    // having to actually wait. Uses Vitest fake timers around Date.now.
    const limiter = createRateLimiter({ windowMs: 1_000, maxRequests: 2 })
    const event = makeEvent('7.7.7.7')

    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      await limiter(event)
      await limiter(event)
      await expect(limiter(event)).rejects.toMatchObject({ statusCode: 429 })

      // Slide forward past the window.
      vi.setSystemTime(new Date('2026-01-01T00:00:02Z'))
      await expect(limiter(event)).resolves.toBeUndefined()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('respects X-Forwarded-For only when TRUSTED_PROXY_IP matches the socket peer', async () => {
    envStub.TRUST_PROXY_HEADERS = false
    envStub.TRUSTED_PROXY_IP = '127.0.0.1'
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 })

    // Request comes through the trusted proxy; XFF carries the real client IP.
    const trustedHop = makeEvent('127.0.0.1', { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })
    await limiter(trustedHop)

    // Same XFF but the socket peer is somebody else — header must be ignored.
    const spoofer = makeEvent('198.51.100.1', { 'x-forwarded-for': '203.0.113.7' })
    await expect(limiter(spoofer)).resolves.toBeUndefined()

    // Re-using the trusted hop with the same forwarded IP should now hit the limit.
    const trustedAgain = makeEvent('127.0.0.1', { 'x-forwarded-for': '203.0.113.7' })
    await expect(limiter(trustedAgain)).rejects.toMatchObject({ statusCode: 429 })
  })

  it('ignores spoofed forwarding headers in the secure default mode', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 })
    const firstSocket = makeEvent('198.51.100.1', { 'x-forwarded-for': '203.0.113.7' })
    const secondSocket = makeEvent('198.51.100.2', { 'x-forwarded-for': '203.0.113.7' })

    await expect(limiter(firstSocket)).resolves.toBeUndefined()
    await expect(limiter(secondSocket)).resolves.toBeUndefined()
    await expect(limiter(firstSocket)).rejects.toMatchObject({ statusCode: 429 })
  })

  it('isolates forwarded clients sharing one explicitly trusted dynamic ingress', async () => {
    envStub.TRUST_PROXY_HEADERS = true
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 })
    const firstClient = makeEvent('10.0.0.5', { 'x-forwarded-for': '203.0.113.7' })
    const secondClient = makeEvent('10.0.0.5', { 'x-forwarded-for': '198.51.100.9' })

    await expect(limiter(firstClient)).resolves.toBeUndefined()
    await expect(limiter(secondClient)).resolves.toBeUndefined()
    await expect(limiter(firstClient)).rejects.toMatchObject({ statusCode: 429 })
  })

  it('uses the first address from a trusted multi-hop forwarded chain', async () => {
    envStub.TRUST_PROXY_HEADERS = true
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 })

    await limiter(makeEvent('10.0.0.5', {
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
    }))

    await expect(limiter(makeEvent('10.0.0.5', {
      'x-forwarded-for': '203.0.113.7, 10.0.0.2',
    }))).rejects.toMatchObject({ statusCode: 429 })
  })

  it('falls back to the socket when trusted forwarding data is missing or empty', async () => {
    envStub.TRUST_PROXY_HEADERS = true
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 })

    await limiter(makeEvent('10.0.0.5'))

    await expect(limiter(makeEvent('10.0.0.5', {
      'x-forwarded-for': ' , ',
    }))).rejects.toMatchObject({ statusCode: 429 })
  })
})

describe('readPositiveIntegerEnv', () => {
  it('uses the default when no override is set', () => {
    expect(readPositiveIntegerEnv(TEST_RATE_LIMIT_ENV, 40)).toBe(40)
  })

  it('reads an explicit positive integer override', () => {
    process.env[TEST_RATE_LIMIT_ENV] = '250'

    expect(readPositiveIntegerEnv(TEST_RATE_LIMIT_ENV, 40)).toBe(250)
  })

  it('warns and falls back for invalid overrides', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      process.env[TEST_RATE_LIMIT_ENV] = '0'

      expect(readPositiveIntegerEnv(TEST_RATE_LIMIT_ENV, 40)).toBe(40)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(TEST_RATE_LIMIT_ENV))
    }
    finally {
      warn.mockRestore()
    }
  })
})

describe('trusted proxy environment', () => {
  const validEnv = {
    DATABASE_URL: 'postgresql://factory-careers:test@localhost:5432/factory-careers',
    BETTER_AUTH_SECRET: 'factory-careers-test-secret-value-32',
    BETTER_AUTH_URL: 'http://localhost:3000',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_ACCESS_KEY: 'factory-careers',
    S3_SECRET_KEY: 'factory-careers-secret',
    S3_BUCKET: 'factory-careers',
  }

  it('keeps dynamic proxy-header trust disabled by default', () => {
    expect(envSchema.parse(validEnv).TRUST_PROXY_HEADERS).toBe(false)
  })

  it('enables dynamic proxy-header trust only from an explicit flag', () => {
    expect(envSchema.parse({
      ...validEnv,
      TRUST_PROXY_HEADERS: 'true',
    }).TRUST_PROXY_HEADERS).toBe(true)
  })
})
