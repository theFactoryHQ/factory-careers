import type { RouterConfig } from '@nuxt/schema'

/**
 * Nuxt Router configuration focused on performance.
 *
 * - Aggressive prefetch on hover for dashboard navigation (common in recruiting tools).
 * - Component prefetch enabled.
 *
 * Combined with the SWR client caching we added to composables,
 * this makes intra-dashboard navigation feel near-instant.
 */
export default <RouterConfig>{
  linkPrefetch: 'hover',
  prefetchComponents: true,

  // Optional: more aggressive prefetch for the main dashboard sidebar links
  // (can be expanded later with custom logic in a plugin if needed)
}