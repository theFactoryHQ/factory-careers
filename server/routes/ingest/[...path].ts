import {
  AnalyticsProxyError,
  ANALYTICS_PROXY_TIMEOUT_MS,
  executeAnalyticsProxyRequest,
  readBoundedAnalyticsRequestBody,
} from '../../utils/analyticsProxyPolicy'
import {
  createAnalyticsProxyConcurrencyGuard,
  holdAnalyticsProxyLeaseUntilResponse,
} from '../../utils/analyticsProxyConcurrency'
import { createAnalyticsProxyRateLimitGuard } from '../../utils/analyticsProxyRateLimit'

/**
 * Bounded, allowlisted reverse proxy for the PostHog browser SDK.
 *
 * Keeping this proxy on our origin helps analytics survive common ad blockers,
 * but it must not become a general-purpose proxy to PostHog. The policy helper
 * therefore owns the exact SDK paths, methods, byte limits, fixed EU hosts,
 * safe headers, and manual redirect behavior.
 */

const enforceAnalyticsProxyRateLimit = createAnalyticsProxyRateLimitGuard()
const acquireAnalyticsProxyLease = createAnalyticsProxyConcurrencyGuard()

export default defineEventHandler(async (event) => {
  let releaseLease: (() => void) | undefined
  let releaseAfterHandler = true
  let bodyDraining = false
  const drainBody = () => {
    if (bodyDraining) return
    bodyDraining = true
    event.node.req.resume()
  }
  const timeoutSignal = AbortSignal.timeout(ANALYTICS_PROXY_TIMEOUT_MS)
  try {
    releaseLease = acquireAnalyticsProxyLease()
    const result = await executeAnalyticsProxyRequest({
      path: getRouterParam(event, 'path') || '',
      method: event.method,
      query: getRequestURL(event).searchParams,
      headers: getRequestHeaders(event),
      readBody: async (maxBytes, signal) => await readBoundedAnalyticsRequestBody(
        event.node.req,
        maxBytes,
        signal,
        () => { bodyDraining = true },
      ),
      drainBody,
    }, {
      fetch: globalThis.fetch,
      enforceRateLimit: async (bucket) => {
        await enforceAnalyticsProxyRateLimit(event, bucket)
      },
      timeoutSignal,
    })

    setResponseStatus(event, result.status, result.statusText)
    result.headers.forEach((value, name) => setResponseHeader(event, name, value))

    holdAnalyticsProxyLeaseUntilResponse(event.node.res, timeoutSignal, releaseLease)
    releaseAfterHandler = false
    return Buffer.from(result.body.buffer, result.body.byteOffset, result.body.byteLength)
  }
  catch (error) {
    drainBody()
    if (error instanceof AnalyticsProxyError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.statusMessage,
        message: error.message,
      })
    }
    throw error
  }
  finally {
    if (releaseAfterHandler) releaseLease?.()
  }
})
