import { isIP } from 'node:net'
import type { H3Event } from 'h3'
import type { AnalyticsRateLimitBucket } from './analyticsProxyPolicy'
import { createRateLimiter } from './rateLimit'

const MAX_IP_HEADER_LENGTH = 512
const MAX_IP_LITERAL_LENGTH = 64

export const ANALYTICS_PROXY_RATE_LIMITS = {
  windowMs: 60_000,
  ingestionPerClient: 120,
  ingestionGlobal: 1_200,
  assetsPerClient: 600,
  assetsGlobal: 6_000,
} as const

interface AnalyticsClientKeyInput {
  socketIp?: string
  cfConnectingIp?: string
  forwardedFor?: string
}

interface AnalyticsProxyRateLimitOptions {
  windowMs?: number
  ingestionPerClient?: number
  ingestionGlobal?: number
  assetsPerClient?: number
  assetsGlobal?: number
  maxTrackedClientKeys?: number
}

function validIpLiteral(rawValue: string | undefined): string | undefined {
  if (!rawValue || rawValue.length > MAX_IP_LITERAL_LENGTH) return undefined
  const candidate = rawValue.trim()
  return isIP(candidate) ? candidate : undefined
}

function firstForwardedIp(rawValue: string | undefined): string | undefined {
  if (!rawValue || rawValue.length > MAX_IP_HEADER_LENGTH) return undefined
  return validIpLiteral(rawValue.split(',', 1)[0])
}

/**
 * Compose the non-spoofable socket peer with a bounded client hint. The hint
 * improves fairness behind Cloudflare/Render, while the independent global
 * family limiter remains the abuse boundary if a direct client spoofs it.
 */
export function buildAnalyticsClientRateLimitKey(input: AnalyticsClientKeyInput): string {
  const socketIp = validIpLiteral(input.socketIp) ?? 'unknown'
  const hintedClientIp = validIpLiteral(input.cfConnectingIp)
    ?? firstForwardedIp(input.forwardedFor)
    ?? 'unknown'
  return `socket:${socketIp}|client:${hintedClientIp}`
}

function keyForAnalyticsClient(event: H3Event): string {
  return buildAnalyticsClientRateLimitKey({
    socketIp: getRequestIP(event),
    cfConnectingIp: getHeader(event, 'cf-connecting-ip'),
    forwardedFor: getHeader(event, 'x-forwarded-for'),
  })
}

export function createAnalyticsProxyRateLimitGuard(options: AnalyticsProxyRateLimitOptions = {}) {
  const windowMs = options.windowMs ?? ANALYTICS_PROXY_RATE_LIMITS.windowMs
  const maxTrackedKeys = options.maxTrackedClientKeys ?? 10_000

  const ingestionGlobal = createRateLimiter({
    windowMs,
    maxRequests: options.ingestionGlobal ?? ANALYTICS_PROXY_RATE_LIMITS.ingestionGlobal,
    message: 'Analytics ingestion is temporarily busy. Please retry shortly.',
    keyResolver: () => 'analytics-ingestion-global',
    maxTrackedKeys: 1,
  })
  const ingestionPerClient = createRateLimiter({
    windowMs,
    maxRequests: options.ingestionPerClient ?? ANALYTICS_PROXY_RATE_LIMITS.ingestionPerClient,
    message: 'Too many analytics ingestion requests. Please retry shortly.',
    keyResolver: keyForAnalyticsClient,
    maxTrackedKeys,
  })
  const assetsGlobal = createRateLimiter({
    windowMs,
    maxRequests: options.assetsGlobal ?? ANALYTICS_PROXY_RATE_LIMITS.assetsGlobal,
    message: 'Analytics assets are temporarily busy. Please retry shortly.',
    keyResolver: () => 'analytics-assets-global',
    maxTrackedKeys: 1,
  })
  const assetsPerClient = createRateLimiter({
    windowMs,
    maxRequests: options.assetsPerClient ?? ANALYTICS_PROXY_RATE_LIMITS.assetsPerClient,
    message: 'Too many analytics asset requests. Please retry shortly.',
    keyResolver: keyForAnalyticsClient,
    maxTrackedKeys,
  })

  return async function enforceAnalyticsProxyRateLimit(
    event: H3Event,
    bucket: AnalyticsRateLimitBucket,
  ): Promise<void> {
    if (bucket === 'assets') {
      await assetsGlobal(event)
      await assetsPerClient(event)
      return
    }

    await ingestionGlobal(event)
    await ingestionPerClient(event)
  }
}
