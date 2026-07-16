import { createRateLimiter } from '../../utils/rateLimit'
import {
  AnalyticsProxyError,
  executeAnalyticsProxyRequest,
  readBoundedAnalyticsRequestBody,
} from '../../utils/analyticsProxyPolicy'

/**
 * Bounded, allowlisted reverse proxy for the PostHog browser SDK.
 *
 * Keeping this proxy on our origin helps analytics survive common ad blockers,
 * but it must not become a general-purpose proxy to PostHog. The policy helper
 * therefore owns the exact SDK paths, methods, byte limits, fixed EU hosts,
 * safe headers, and manual redirect behavior.
 */

const ingestionRateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 120,
  message: 'Too many analytics ingestion requests. Please retry shortly.',
})

const assetRateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 600,
  message: 'Too many analytics asset requests. Please retry shortly.',
})

export default defineEventHandler(async (event) => {
  try {
    const result = await executeAnalyticsProxyRequest({
      path: getRouterParam(event, 'path') || '',
      method: event.method,
      query: getRequestURL(event).searchParams,
      headers: getRequestHeaders(event),
      readBody: async (maxBytes) => await readBoundedAnalyticsRequestBody(event.node.req, maxBytes),
    }, {
      fetch: globalThis.fetch,
      enforceRateLimit: async (bucket) => {
        await (bucket === 'assets' ? assetRateLimit : ingestionRateLimit)(event)
      },
    })

    setResponseStatus(event, result.status, result.statusText)
    result.headers.forEach((value, name) => setResponseHeader(event, name, value))
    return Buffer.from(result.body)
  }
  catch (error) {
    if (error instanceof AnalyticsProxyError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.statusMessage,
        message: error.message,
      })
    }
    throw error
  }
})
