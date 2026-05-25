import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateInterviewToken, verifyInterviewToken } from '../../server/utils/interview-token'

const secret = 'test-secret-with-enough-entropy-for-hmac'

describe('interview response token security', () => {
  it('verifies valid signed tokens', () => {
    const token = generateInterviewToken('interview-123', 'accepted', secret)

    expect(verifyInterviewToken(token, secret)).toMatchObject({
      id: 'interview-123',
      action: 'accepted',
    })
  })

  it('rejects malformed hex signatures without throwing', () => {
    const token = generateInterviewToken('interview-123', 'accepted', secret)
    const [payload] = token.split('.')

    expect(() => verifyInterviewToken(`${payload}.not-a-hex-signature`, secret)).not.toThrow()
    expect(verifyInterviewToken(`${payload}.not-a-hex-signature`, secret)).toBeNull()
  })

  it('rejects oversized signature segments before timing-safe comparison', () => {
    const token = generateInterviewToken('interview-123', 'accepted', secret)
    const [payload] = token.split('.')

    expect(verifyInterviewToken(`${payload}.${'a'.repeat(257)}`, secret)).toBeNull()
  })

  it('uses the shared timing-safe string comparison helper', () => {
    const source = readFileSync(join(process.cwd(), 'server/utils/interview-token.ts'), 'utf8')

    expect(source).toContain('const MAX_TOKEN_LENGTH = 4096')
    expect(source).toContain('const MAX_SIGNATURE_LENGTH = 256')
    expect(source).toContain("import { timingSafeStringEqual } from './secureCompare'")
    expect(source).toContain('timingSafeStringEqual(providedSig, expectedSig)')
    expect(source).not.toContain('timingSafeEqual(')
    expect(source).not.toContain('providedSig.length !== expectedSig.length')
  })
})
