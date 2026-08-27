/** Extract an HTTP status code from a Nuxt/ofetch error or similar object. */
export function getFetchStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined

  const record = error as Record<string, unknown>
  const nested = record.data && typeof record.data === 'object'
    ? record.data as Record<string, unknown>
    : undefined

  const candidates = [record.statusCode, record.status, nested?.statusCode, nested?.status]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const parsed = Number(value)
      if (parsed > 0) return parsed
    }
  }

  return undefined
}

export function isNotFoundFetchError(error: unknown): boolean {
  return getFetchStatusCode(error) === 404
}

/**
 * Transient failures a Retry can reasonably recover: network/timeouts,
 * 408, 429, and 5xx. Client errors such as 400/403/404 are permanent.
 */
export function isRetryableFetchError(error: unknown): boolean {
  const status = getFetchStatusCode(error)
  if (status == null) return true
  return status === 408 || status === 429 || status >= 500
}

export function isPermanentFetchError(error: unknown, extraPermanentStatusCodes: number[] = []): boolean {
  const status = getFetchStatusCode(error)
  if (status == null) return false
  if (status === 404 || extraPermanentStatusCodes.includes(status)) return true
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

export function formatApplicationSubmitError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error || typeof error !== 'object') return fallback

  const record = error as Record<string, unknown>
  const nested = record.data && typeof record.data === 'object'
    ? record.data as Record<string, unknown>
    : undefined
  const statusMessage = (nested?.statusMessage ?? record.statusMessage)
  const message = typeof statusMessage === 'string' && statusMessage.trim()
    ? statusMessage
    : undefined

  if (isRetryableFetchError(error)) {
    return message && !/^internal server error$/i.test(message)
      ? message
      : 'We couldn\'t submit your application. Check your connection and try again.'
  }

  return message ?? fallback
}
