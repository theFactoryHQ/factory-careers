import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  encryptApplicationIntakeEnvelope,
  parseApplicationIntakeKeyring,
  type ApplicationIntakeEnvelope,
} from '../../server/utils/applicationIntakeRecovery'
import {
  listApplicationIntakeReceipts,
  loadApplicationIntakeReceipt,
  purgeExpiredApplicationIntakeReceipts,
  replayApplicationIntakeEnvelope,
} from '../../server/utils/applicationIntakeRecoveryOperations'

const receiptId = '01915bb8-7f34-7a3e-8b3e-2d1db55bb71a'
const storageKey = `_application-intake/v1/2026-08-14/${receiptId}.json`
const keyring = parseApplicationIntakeKeyring(JSON.stringify({ current: randomBytes(32).toString('base64') }))
const envelope: ApplicationIntakeEnvelope = {
  version: 1,
  capturedAt: '2026-08-14T12:00:00.000Z',
  jobSlug: 'general-interest',
  fields: {
    firstName: 'Private',
    lastName: 'Applicant',
    email: 'private@example.com',
    phone: '555-0100',
    country: 'United States',
    state: 'NY',
    compliance: { sex: 'prefer_not_to_answer' },
  },
  responses: [{ questionId: 'q1', value: 'answer' }],
  files: [{
    fieldName: 'resume',
    filename: 'resume.pdf',
    mimeType: 'application/pdf',
    dataBase64: Buffer.from('%PDF-1.4').toString('base64'),
  }],
}
const encrypted = encryptApplicationIntakeEnvelope(envelope, {
  keyring,
  activeKeyId: 'current',
  receiptId,
  expiresAt: '2026-08-21T12:00:00.000Z',
})
const bytes = Buffer.from(JSON.stringify(encrypted))

describe('application intake recovery owner operations', () => {
  it('lists metadata without decrypted applicant fields', async () => {
    const result = await listApplicationIntakeReceipts({
      listObjects: vi.fn(async () => [{ key: storageKey, sizeBytes: bytes.length }]),
      downloadObject: vi.fn(async () => bytes),
    })
    expect(result).toEqual([{
      receiptId,
      createdAt: '2026-08-14T12:00:00.000Z',
      expiresAt: '2026-08-21T12:00:00.000Z',
      keyId: 'current',
      sizeBytes: bytes.length,
    }])
    expect(JSON.stringify(result)).not.toContain('private@example.com')
    expect(JSON.stringify(result)).not.toContain('resume.pdf')
  })

  it('loads and authenticates a receipt only with its keyring', async () => {
    const result = await loadApplicationIntakeReceipt(receiptId, keyring, {
      listObjects: vi.fn(async () => [{ key: storageKey }]),
      downloadObject: vi.fn(async () => bytes),
    })
    expect(result.envelope).toEqual(envelope)
    await expect(loadApplicationIntakeReceipt('not-a-receipt', keyring, {
      listObjects: vi.fn(),
      downloadObject: vi.fn(),
    })).rejects.toThrow(/receipt/i)
  })

  it('replays the encrypted envelope through the public multipart workflow', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData
      expect(init?.headers).toMatchObject({
        'x-application-intake-replay': '1',
        'x-application-intake-receipt': receiptId,
        'x-cron-secret': 'cron-secret',
      })
      expect(form.get('email')).toBe('private@example.com')
      expect(form.get('resume')).toBeInstanceOf(Blob)
      return Response.json({ success: true }, { status: 201 })
    })
    await expect(replayApplicationIntakeEnvelope(envelope, {
      baseUrl: 'https://careers.example.com',
      secret: 'cron-secret',
      receiptId,
      fetchFn,
    })).resolves.toEqual({ outcome: 'completed' })
  })

  it('does not mistake an unrelated duplicate for a completed recovery receipt', async () => {
    await expect(replayApplicationIntakeEnvelope(envelope, {
      baseUrl: 'https://careers.example.com',
      secret: 'cron-secret',
      receiptId,
      fetchFn: vi.fn(async () => Response.json({ data: { code: 'duplicate_application' } }, { status: 409 })),
    })).rejects.toThrow(/replay failed/i)
  })

  it('purges only expired objects and reports metadata counts', async () => {
    const currentEncrypted = { ...encrypted, expiresAt: '2026-08-22T12:00:00.000Z' }
    const deleteObject = vi.fn(async () => undefined)
    const result = await purgeExpiredApplicationIntakeReceipts({
      now: new Date('2026-08-21T12:00:00.000Z'),
      listObjects: vi.fn(async () => [
        { key: storageKey },
        { key: `_application-intake/v1/2026-08-15/01915bb8-7f34-7a3e-8b3e-2d1db55bb71b.json` },
      ]),
      downloadObject: vi.fn(async (key) => key === storageKey
        ? bytes
        : Buffer.from(JSON.stringify(currentEncrypted))),
      deleteObject,
    })
    expect(result).toEqual({ scanned: 2, purged: 1 })
    expect(deleteObject).toHaveBeenCalledExactlyOnceWith(storageKey)
  })
})
