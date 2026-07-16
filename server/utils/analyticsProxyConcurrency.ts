import { AnalyticsProxyError } from './analyticsProxyPolicy'

const DEFAULT_MAX_IN_FLIGHT = 32

/**
 * Bound buffered upstream responses until Nitro has finished sending them.
 * The returned release callback is idempotent because Node may emit both
 * `finish` and `close` for the same response.
 */
export function createAnalyticsProxyConcurrencyGuard(maxInFlight = DEFAULT_MAX_IN_FLIGHT) {
  const capacity = Number.isInteger(maxInFlight) && maxInFlight > 0
    ? maxInFlight
    : DEFAULT_MAX_IN_FLIGHT
  let inFlight = 0

  return function acquire(): () => void {
    if (inFlight >= capacity) {
      throw new AnalyticsProxyError(
        503,
        'Service Unavailable',
        'Analytics proxy is temporarily at capacity',
      )
    }

    inFlight += 1
    let released = false
    return () => {
      if (released) return
      released = true
      inFlight -= 1
    }
  }
}

interface AnalyticsResponseLifecycle {
  once: (event: 'finish' | 'close', listener: () => void) => unknown
  removeListener?: (event: 'finish' | 'close', listener: () => void) => unknown
  destroy?: () => unknown
}

/** Hold a lease until downstream completes, closes, or exceeds the request deadline. */
export function holdAnalyticsProxyLeaseUntilResponse(
  response: AnalyticsResponseLifecycle,
  signal: AbortSignal,
  release: () => void,
): void {
  let complete = false
  const finish = () => {
    if (complete) return
    complete = true
    signal.removeEventListener('abort', abort)
    response.removeListener?.('finish', finish)
    response.removeListener?.('close', finish)
    release()
  }
  const abort = () => {
    try {
      response.destroy?.()
    }
    finally {
      finish()
    }
  }

  response.once('finish', finish)
  response.once('close', finish)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
}
