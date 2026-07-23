import type { H3Event } from 'h3'

// ─────────────────────────────────────────────
// In-memory sliding window rate limiter
// ─────────────────────────────────────────────

// Warn loudly at startup when the process appears to be running as one of
// several replicas. Each replica holds its own in-memory state, so the
// effective limit seen by any single client is maxRequests × replicaCount.
// Under horizontal scaling, terminate rate limiting at the edge instead:
// Cloudflare WAF, Caddy `rate_limit`, nginx `limit_req`, or a Redis-backed
// limiter. See SELF-HOSTING.md → "Scaling horizontally".
const _replicaCount = Number(process.env.RAILWAY_REPLICA_COUNT ?? 0)
if (_replicaCount > 1) {
  console.warn(
    `[rateLimit] WARNING: RAILWAY_REPLICA_COUNT=${_replicaCount}. `
    + 'The in-memory rate limiter is NOT shared across replicas — effective limits are '
    + `${_replicaCount}× higher than configured. Move rate limiting to the edge.`,
  )
}

/**
 * Configuration for a rate limiter instance.
 *
 * @param windowMs - Time window in milliseconds
 * @param maxRequests - Maximum number of requests allowed within the window
 * @param message - Error message returned when the limit is exceeded
 */
export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  message?: string
  /** Override the secure socket-IP key for routes with a stronger composite policy. */
  keyResolver?: (event: H3Event) => string | undefined
  /** Maximum distinct resolved keys retained before new keys share an overflow bucket. */
  maxTrackedKeys?: number
  /** Emit headers on every request (default) or only when this limiter rejects. */
  headerMode?: 'always' | 'on-limit'
}

interface RateLimitEntry {
  timestamps: number[]
}

export interface RateLimitReservation {
  commit: () => void
}

export interface RateLimiter {
  (event: H3Event): Promise<void>
  reserve: (event: H3Event) => RateLimitReservation
}

const DEFAULT_MAX_TRACKED_KEYS = 10_000
const MAX_RATE_LIMIT_KEY_LENGTH = 256
const OVERFLOW_KEY = Symbol('rate-limit-overflow')

/**
 * Create a reusable rate limiter scoped by client IP by default, or by an
 * explicit bounded key resolver for routes with a layered abuse policy.
 *
 * Uses a sliding window algorithm — each request records a timestamp,
 * and only timestamps within the current window are counted.
 *
 * State is per-process and per-limiter: each call to createRateLimiter()
 * builds its own Map, so two limiters never share buckets even when their
 * window/max are identical.
 *
 * Reqcore is designed as a single-instance self-hosted app (Docker Compose
 * on one VPS). If you need to run multiple replicas behind a load balancer,
 * terminate rate limiting at the edge instead — Cloudflare WAF, Caddy
 * `rate_limit`, or nginx `limit_req`. See SELF-HOSTING.md → "Scaling
 * horizontally" for the rationale.
 *
 * @example
 * ```ts
 * const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 })
 *
 * export default defineEventHandler(async (event) => {
 *   await limiter(event)
 *   // ... handler logic
 * })
 * ```
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later',
    keyResolver,
    headerMode = 'always',
  } = config
  const maxTrackedKeys = Number.isInteger(config.maxTrackedKeys) && config.maxTrackedKeys! > 0
    ? config.maxTrackedKeys!
    : DEFAULT_MAX_TRACKED_KEYS
  const store = new Map<string | typeof OVERFLOW_KEY, RateLimitEntry>()
  let nextExpiryAt = Number.POSITIVE_INFINITY

  function pruneExpired(now: number): void {
    if (now < nextExpiryAt) return

    let earliestRemainingExpiry = Number.POSITIVE_INFINITY
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter(timestamp => now - timestamp < windowMs)
      if (entry.timestamps.length === 0) {
        store.delete(key)
        continue
      }
      earliestRemainingExpiry = Math.min(
        earliestRemainingExpiry,
        entry.timestamps[0]! + windowMs,
      )
    }
    nextExpiryAt = earliestRemainingExpiry
  }

  // Periodically prune stale entries to prevent unbounded memory growth
  const PRUNE_INTERVAL = Math.max(windowMs * 2, 60_000)
  setInterval(() => {
    pruneExpired(Date.now())
  }, PRUNE_INTERVAL).unref() // .unref() prevents the timer from keeping the process alive

  /**
   * Check and enforce the rate limit for the current request.
   * Throws a 429 error if the limit is exceeded.
   * Sets standard rate limit headers on every response.
   */
  function reserve(event: H3Event): RateLimitReservation {
    let resolvedKey: string | undefined
    if (keyResolver) {
      try {
        resolvedKey = keyResolver(event)?.trim()
      }
      catch {
        // A route-specific resolver must never disable the secure default.
      }
    }
    const boundedKey = resolvedKey
      ? resolvedKey.slice(0, MAX_RATE_LIMIT_KEY_LENGTH)
      : getClientIp(event)
    const now = Date.now()
    pruneExpired(now)

    const trackedKeyCount = store.size - (store.has(OVERFLOW_KEY) ? 1 : 0)
    const key = !store.has(boundedKey) && trackedKeyCount >= maxTrackedKeys
      ? OVERFLOW_KEY
      : boundedKey
    const timestamps = store.get(key)?.timestamps ?? []

    // Set rate limit headers (draft RFC 7.2 / common convention)
    const remaining = Math.max(0, maxRequests - timestamps.length)
    const resetSeconds = timestamps.length > 0
      ? Math.ceil((timestamps[0]! + windowMs - now) / 1000)
      : Math.ceil(windowMs / 1000)

    const isLimited = timestamps.length >= maxRequests
    if (headerMode === 'always' || isLimited) {
      setResponseHeaders(event, {
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(resetSeconds),
      })
    }

    if (isLimited) {
      setResponseHeader(event, 'Retry-After', resetSeconds)
      throw createError({
        statusCode: 429,
        statusMessage: message,
      })
    }

    return {
      commit() {
        let entry = store.get(key)
        if (!entry) {
          entry = { timestamps: [] }
          store.set(key, entry)
        }
        entry.timestamps.push(now)
        nextExpiryAt = Math.min(nextExpiryAt, now + windowMs)
      },
    }
  }

  const rateLimit = (async (event: H3Event): Promise<void> => {
    reserve(event).commit()
  }) as RateLimiter
  rateLimit.reserve = reserve
  return rateLimit
}

/**
 * Extract the client IP from the request.
 *
 * Security: Does NOT trust proxy headers (X-Forwarded-For, X-Real-IP) by default
 * because they are trivially spoofable by direct clients. Uses the socket remote
 * address which cannot be forged at the application layer.
 *
 * If running behind a managed ingress that owns the forwarding headers and
 * cannot be bypassed, set TRUST_PROXY_HEADERS. For a self-hosted reverse proxy
 * with a stable peer address, set TRUSTED_PROXY_IP instead.
 */
function getClientIp(event: H3Event): string {
  const socketIp = getRequestIP(event)

  // Dynamic managed ingress mode. The deployment must overwrite the forwarded
  // client address and prevent direct public access to this application.
  if (env.TRUST_PROXY_HEADERS) {
    const forwardedIp = getRequestIP(event, { xForwardedFor: true })?.trim()
    return forwardedIp || socketIp || '0.0.0.0'
  }

  // Static self-hosted proxy mode. Only the configured socket peer can supply
  // forwarding headers.
  const trustedProxy = env.TRUSTED_PROXY_IP
  if (trustedProxy) {
    if (socketIp === trustedProxy) {
      // Request came from the trusted proxy — read the forwarded header
      const forwarded = getHeader(event, 'x-forwarded-for')
      if (forwarded) {
        const firstIp = forwarded.split(',')[0]?.trim()
        if (firstIp) return firstIp
      }

      const realIp = getHeader(event, 'x-real-ip')
      if (realIp) return realIp
    }
  }

  // Default: use the socket remote address (cannot be spoofed)
  return socketIp ?? '0.0.0.0'
}
