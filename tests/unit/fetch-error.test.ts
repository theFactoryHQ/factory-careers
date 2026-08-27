import { describe, expect, it } from 'vitest'
import {
  formatApplicationSubmitError,
  getFetchStatusCode,
  isNotFoundFetchError,
  isPermanentFetchError,
  isRetryableFetchError,
} from '../../app/utils/fetch-error'

describe('fetch error classification', () => {
  it('reads nested Nuxt and ofetch status codes', () => {
    expect(getFetchStatusCode({ statusCode: 404 })).toBe(404)
    expect(getFetchStatusCode({ status: 503 })).toBe(503)
    expect(getFetchStatusCode({ data: { statusCode: 429 } })).toBe(429)
    expect(getFetchStatusCode({ statusCode: '500' })).toBe(500)
    expect(getFetchStatusCode(new Error('network'))).toBeUndefined()
  })

  it('treats missing and 5xx statuses as retryable, and 404 as not found', () => {
    expect(isRetryableFetchError({ message: 'Failed to fetch' })).toBe(true)
    expect(isRetryableFetchError({ statusCode: 500 })).toBe(true)
    expect(isRetryableFetchError({ statusCode: 429 })).toBe(true)
    expect(isRetryableFetchError({ statusCode: 404 })).toBe(false)
    expect(isRetryableFetchError({ statusCode: 400 })).toBe(false)
    expect(isNotFoundFetchError({ statusCode: 404 })).toBe(true)
    expect(isNotFoundFetchError({ statusCode: 500 })).toBe(false)
  })

  it('treats extra permanent statuses such as expired interview links as non-retryable', () => {
    expect(isPermanentFetchError({ statusCode: 400 }, [400])).toBe(true)
    expect(isPermanentFetchError({ statusCode: 500 }, [400])).toBe(false)
    expect(isPermanentFetchError({ statusCode: 404 })).toBe(true)
  })

  it('gives applicants a connection-oriented message for retryable submit failures', () => {
    expect(formatApplicationSubmitError({ message: 'Failed to fetch' })).toBe(
      'We couldn\'t submit your application. Check your connection and try again.',
    )
    expect(formatApplicationSubmitError({
      data: { statusCode: 500, statusMessage: 'Internal Server Error' },
    })).toBe('We couldn\'t submit your application. Check your connection and try again.')
    expect(formatApplicationSubmitError({
      data: { statusCode: 400, statusMessage: 'Resume/CV is required' },
    })).toBe('Resume/CV is required')
  })
})
