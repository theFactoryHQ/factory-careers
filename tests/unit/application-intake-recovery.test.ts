import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createApplicationIntakeReceipt,
  decryptApplicationIntakeEnvelope,
  encryptApplicationIntakeEnvelope,
  isApplicationIntakeReceiptExpired,
  isExpectedApplicationIntakeFailure,
  parseApplicationIntakeKeyring,
  type ApplicationIntakeEnvelope,
} from '../../server/utils/applicationIntakeRecovery'

const envelope: ApplicationIntakeEnvelope = {
  version: 1,
  capturedAt: '2026-08-14T12:00:00.000Z',
  jobSlug: 'accounting-manager',
  fields: {
    firstName: 'Private',
    lastName: 'Applicant',
    email: 'private@example.com',
    country: 'United States',
    state: 'NY',
  },
  responses: [{ questionId: 'question-1', value: 'Confidential response' }],
  files: [{
    fieldName: 'resume',
    filename: 'private-resume.pdf',
    mimeType: 'application/pdf',
    dataBase64: Buffer.from('private resume bytes').toString('base64'),
  }],
}

function key(): string {
  return randomBytes(32).toString('base64')
}

describe('application intake recovery encryption', () => {
  it('round trips the complete envelope without plaintext in the stored object', () => {
    const keyring = parseApplicationIntakeKeyring(JSON.stringify({ current: key() }))
    const receiptId = '01915bb8-7f34-7a3e-8b3e-2d1db55bb71a'
    const encrypted = encryptApplicationIntakeEnvelope(envelope, {
      keyring,
      activeKeyId: 'current',
      receiptId,
      expiresAt: '2026-08-21T12:00:00.000Z',
    })
    const serialized = JSON.stringify(encrypted)

    expect(serialized).not.toContain('private@example.com')
    expect(serialized).not.toContain('private-resume.pdf')
    expect(serialized).not.toContain('Confidential response')
    expect(decryptApplicationIntakeEnvelope(encrypted, { keyring, receiptId })).toEqual(envelope)
  })

  it('rejects ciphertext and authentication metadata tampering', () => {
    const keyring = parseApplicationIntakeKeyring(JSON.stringify({ current: key() }))
    const receiptId = '01915bb8-7f34-7a3e-8b3e-2d1db55bb71b'
    const encrypted = encryptApplicationIntakeEnvelope(envelope, {
      keyring,
      activeKeyId: 'current',
      receiptId,
      expiresAt: '2026-08-21T12:00:00.000Z',
    })

    const tampered = { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA` }
    expect(() => decryptApplicationIntakeEnvelope(tampered, { keyring, receiptId })).toThrow()
    expect(() => decryptApplicationIntakeEnvelope(encrypted, {
      keyring,
      receiptId: '01915bb8-7f34-7a3e-8b3e-2d1db55bb71c',
    })).toThrow()
  })

  it('supports rotation while rejecting missing and malformed keys', () => {
    const oldKey = key()
    const newKey = key()
    const keyring = parseApplicationIntakeKeyring(JSON.stringify({ old: oldKey, current: newKey }))
    const receiptId = '01915bb8-7f34-7a3e-8b3e-2d1db55bb71d'
    const encrypted = encryptApplicationIntakeEnvelope(envelope, {
      keyring,
      activeKeyId: 'old',
      receiptId,
      expiresAt: '2026-08-21T12:00:00.000Z',
    })

    expect(decryptApplicationIntakeEnvelope(encrypted, { keyring, receiptId })).toEqual(envelope)
    expect(() => decryptApplicationIntakeEnvelope(encrypted, {
      keyring: parseApplicationIntakeKeyring(JSON.stringify({ current: newKey })),
      receiptId,
    })).toThrow(/key/i)
    expect(() => parseApplicationIntakeKeyring(JSON.stringify({ bad: Buffer.alloc(31).toString('base64') }))).toThrow(/32 bytes/i)
  })

  it('writes under a random non-identifying key and exposes metadata only', async () => {
    const putObject = vi.fn(async () => undefined)
    const now = new Date('2026-08-14T12:00:00.000Z')
    const result = await createApplicationIntakeReceipt(envelope, {
      keyring: parseApplicationIntakeKeyring(JSON.stringify({ current: key() })),
      activeKeyId: 'current',
      retentionDays: 7,
      now,
      putObject,
    })

    expect(result).toEqual({
      receiptId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      storageKey: expect.stringMatching(/^_application-intake\/v1\/2026-08-14\/[0-9a-f-]{36}\.json$/),
      createdAt: now.toISOString(),
      expiresAt: '2026-08-21T12:00:00.000Z',
      keyId: 'current',
    })
    expect(result.storageKey).not.toContain('private')
    const stored = putObject.mock.calls[0]?.[1]
    expect(Buffer.from(stored as Uint8Array).toString('utf8')).not.toContain('private@example.com')
  })

  it('expires receipts at the configured seven-day boundary', () => {
    expect(isApplicationIntakeReceiptExpired(
      { expiresAt: '2026-08-21T12:00:00.000Z' },
      new Date('2026-08-21T11:59:59.999Z'),
    )).toBe(false)
    expect(isApplicationIntakeReceiptExpired(
      { expiresAt: '2026-08-21T12:00:00.000Z' },
      new Date('2026-08-21T12:00:00.000Z'),
    )).toBe(true)
  })

  it('distinguishes expected applicant errors from downstream failures', () => {
    expect(isExpectedApplicationIntakeFailure({ statusCode: 400 })).toBe(true)
    expect(isExpectedApplicationIntakeFailure({ statusCode: 409 })).toBe(true)
    expect(isExpectedApplicationIntakeFailure({ statusCode: 499 })).toBe(true)
    expect(isExpectedApplicationIntakeFailure({ statusCode: 500 })).toBe(false)
    expect(isExpectedApplicationIntakeFailure(new Error('database unavailable'))).toBe(false)
  })
})
