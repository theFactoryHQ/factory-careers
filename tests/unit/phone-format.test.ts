import { describe, expect, it } from 'vitest'
import { formatPhoneNumber } from '../../app/utils/phone-format'

describe('formatPhoneNumber', () => {
  it('formats 10 digit US phone numbers', () => {
    expect(formatPhoneNumber('8643103414')).toBe('(864) 310-3414')
  })

  it('formats 11 digit US phone numbers with the country code', () => {
    expect(formatPhoneNumber('18643103414')).toBe('+1 (864) 310-3414')
    expect(formatPhoneNumber('+18643103414')).toBe('+1 (864) 310-3414')
  })

  it('keeps extensions attached to formatted US numbers', () => {
    expect(formatPhoneNumber('8643103414 x55')).toBe('(864) 310-3414 x55')
  })

  it('preserves already formatted or ambiguous international numbers', () => {
    expect(formatPhoneNumber('+49 170 1234567')).toBe('+49 170 1234567')
    expect(formatPhoneNumber('491701234567')).toBe('491701234567')
  })

  it('returns an empty string for missing phone numbers', () => {
    expect(formatPhoneNumber(null)).toBe('')
    expect(formatPhoneNumber(undefined)).toBe('')
  })
})
