import { describe, expect, it } from 'vitest'
import { formatPublicJobDate } from '../../shared/public-job-date'
import { buildPublicJobRouteRules } from '../../shared/public-job-route-rules'

describe('public job route freshness', () => {
  it('keeps lists and detail pages within 60 seconds while never caching forms', () => {
    expect(buildPublicJobRouteRules([
      { code: 'en' },
      { code: 'es' },
    ], 'en')).toEqual({
      '/jobs': { swr: 60 },
      '/jobs/**': { swr: 60 },
      '/jobs/**/apply': { cache: false },
      '/jobs/**/confirmation': { cache: false },
      '/es/jobs': { swr: 60 },
      '/es/jobs/**': { swr: 60 },
      '/es/jobs/**/apply': { cache: false },
      '/es/jobs/**/confirmation': { cache: false },
    })
  })
})

describe('public job date formatting', () => {
  it('renders a UTC date identically for supported locales', () => {
    expect(formatPublicJobDate('2026-06-14T00:00:00.000Z', 'en-US')).toBe('Jun 14, 2026')
    expect(formatPublicJobDate('2026-06-14T00:00:00.000Z', 'es')).toBe('14 jun 2026')
  })
})
