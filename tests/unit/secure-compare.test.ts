import { describe, expect, it } from 'vitest'
import { timingSafeStringEqual } from '../../server/utils/secureCompare'

describe('timingSafeStringEqual', () => {
  it('accepts identical secrets', () => {
    expect(timingSafeStringEqual('secret-value', 'secret-value')).toBe(true)
  })

  it('rejects different secrets with the same length', () => {
    expect(timingSafeStringEqual('secret-value-a', 'secret-value-b')).toBe(false)
  })

  it('rejects a prefix match when secrets are longer than 64 bytes', () => {
    const prefix = 'a'.repeat(64)
    const actual = `${prefix}attacker-controlled-suffix`
    const expected = `${prefix}real-production-secret`

    expect(timingSafeStringEqual(actual, expected)).toBe(false)
  })

  it('rejects values with equal text but different byte representation', () => {
    expect(timingSafeStringEqual('cafe\u0301', 'café')).toBe(false)
  })

  it('rejects different-length values without throwing', () => {
    expect(timingSafeStringEqual('short', 'a much longer secret value')).toBe(false)
  })
})
