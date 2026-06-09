/** Default TTL (seconds) for org-scoped dashboard list/stats Nitro SWR caches. */
export const ORG_SCOPED_CACHE_MAX_AGE_SECONDS = 30

/**
 * Nitro `defineCachedEventHandler` defaults for authenticated, org-scoped read APIs.
 * `varies` preserves cookie/bearer sessions so cache entries never cross tenants.
 */
export const orgScopedCacheOptions = {
  maxAge: ORG_SCOPED_CACHE_MAX_AGE_SECONDS,
  swr: true,
  varies: ['cookie', 'authorization'] as const,
}