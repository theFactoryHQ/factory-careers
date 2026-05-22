import { createRateLimiter } from '../utils/rateLimit'
import { readPositiveIntegerEnv } from '../utils/rateLimitConfig'

const SAFE_METHODS = new Set(['GET', 'HEAD'])
const SKIP_METHODS = new Set(['OPTIONS'])

const GLOBAL_READ_RATE_LIMIT_MAX = readPositiveIntegerEnv(
  'API_GLOBAL_READ_RATE_LIMIT_MAX_REQUESTS',
  300,
)
const GLOBAL_WRITE_RATE_LIMIT_MAX = readPositiveIntegerEnv(
  'API_GLOBAL_WRITE_RATE_LIMIT_MAX_REQUESTS',
  80,
)
const AUTH_READ_RATE_LIMIT_MAX = readPositiveIntegerEnv(
  'API_AUTH_READ_RATE_LIMIT_MAX_REQUESTS',
  600,
)
const AUTH_WRITE_RATE_LIMIT_MAX = readPositiveIntegerEnv(
  'API_AUTH_WRITE_RATE_LIMIT_MAX_REQUESTS',
  40,
)

// Baseline global API limits (per IP)
const globalReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: GLOBAL_READ_RATE_LIMIT_MAX,
  message: 'Too many API requests. Please try again shortly.',
})

const globalWriteLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: GLOBAL_WRITE_RATE_LIMIT_MAX,
  message: 'Too many write requests. Please try again shortly.',
})

// Auth endpoints get their own buckets to reduce brute-force risk without
// starving the rest of the API traffic from the same IP.
const authReadLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: AUTH_READ_RATE_LIMIT_MAX,
  message: 'Too many auth requests. Please try again shortly.',
})

const authWriteLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: AUTH_WRITE_RATE_LIMIT_MAX,
  message: 'Too many sign-in attempts. Please wait before trying again.',
})

export default defineEventHandler(async (event) => {
  // Skip all rate limiting outside production. CI flags must not bypass this
  // when NODE_ENV=production because several deployment platforms set them.
  if (process.env.NODE_ENV !== 'production') return

  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return

  const method = event.method.toUpperCase()
  if (SKIP_METHODS.has(method)) return

  if (path.startsWith('/api/auth/')) {
    if (SAFE_METHODS.has(method)) {
      await authReadLimiter(event)
      return
    }

    await authWriteLimiter(event)
    return
  }

  if (SAFE_METHODS.has(method)) {
    await globalReadLimiter(event)
    return
  }

  await globalWriteLimiter(event)
})
