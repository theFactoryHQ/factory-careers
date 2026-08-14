import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto'
import { deleteFromS3, uploadToS3 } from './s3'

const RECOVERY_PREFIX = '_application-intake/v1'
const AAD_PREFIX = 'factory-careers-application-intake:v1'

export type ApplicationIntakeFile = {
  fieldName: string
  filename: string
  mimeType: string
  dataBase64: string
}

export type ApplicationIntakeEnvelope = {
  version: 1
  capturedAt: string
  jobSlug: string
  fields: {
    firstName: string
    lastName: string
    email: string
    phone?: string
    country: string
    state: string
    coverLetterText?: string
    ref?: string
    utmSource?: string
    utmMedium?: string
    utmCampaign?: string
    utmTerm?: string
    utmContent?: string
    compliance?: Record<string, string | undefined>
  }
  responses: Array<{
    questionId: string
    value: string | string[] | number | boolean
  }>
  files: ApplicationIntakeFile[]
}

export type ApplicationIntakeKeyring = ReadonlyMap<string, Buffer>

export type EncryptedApplicationIntake = {
  version: 1
  algorithm: 'aes-256-gcm'
  keyId: string
  createdAt: string
  expiresAt: string
  iv: string
  authTag: string
  ciphertext: string
}

export type ApplicationIntakeReceiptMetadata = {
  receiptId: string
  storageKey: string
  createdAt: string
  expiresAt: string
  keyId: string
}

function parseBase64Key(value: unknown, keyId: string): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`Application intake key ${keyId} must be base64 encoded`)
  }
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) {
    throw new Error(`Application intake key ${keyId} must decode to exactly 32 bytes`)
  }
  return key
}

export function parseApplicationIntakeKeyring(raw: string): ApplicationIntakeKeyring {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    throw new Error('APPLICATION_INTAKE_KEYRING must be valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('APPLICATION_INTAKE_KEYRING must be a key ID to base64 key object')
  }

  const entries = Object.entries(parsed)
  if (entries.length === 0) throw new Error('APPLICATION_INTAKE_KEYRING must contain at least one key')
  return new Map(entries.map(([keyId, value]) => {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) {
      throw new Error('Application intake key IDs must contain only letters, numbers, dot, underscore, or dash')
    }
    return [keyId, parseBase64Key(value, keyId)]
  }))
}

function aad(keyId: string, receiptId: string, expiresAt: string): Buffer {
  return Buffer.from(`${AAD_PREFIX}:${keyId}:${receiptId}:${expiresAt}`, 'utf8')
}

export function encryptApplicationIntakeEnvelope(
  envelope: ApplicationIntakeEnvelope,
  options: {
    keyring: ApplicationIntakeKeyring
    activeKeyId: string
    receiptId: string
    expiresAt: string
  },
): EncryptedApplicationIntake {
  const key = options.keyring.get(options.activeKeyId)
  if (!key) throw new Error('Active application intake key ID is not present in the keyring')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad(options.activeKeyId, options.receiptId, options.expiresAt))
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(envelope), 'utf8'),
    cipher.final(),
  ])
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    keyId: options.activeKeyId,
    createdAt: envelope.capturedAt,
    expiresAt: options.expiresAt,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

export function decryptApplicationIntakeEnvelope(
  encrypted: EncryptedApplicationIntake,
  options: { keyring: ApplicationIntakeKeyring, receiptId: string },
): ApplicationIntakeEnvelope {
  if (encrypted.version !== 1 || encrypted.algorithm !== 'aes-256-gcm') {
    throw new Error('Unsupported application intake recovery format')
  }
  const key = options.keyring.get(encrypted.keyId)
  if (!key) throw new Error('Application intake recovery key is unavailable')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'))
  decipher.setAAD(aad(encrypted.keyId, options.receiptId, encrypted.expiresAt))
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ])
  const envelope = JSON.parse(plaintext.toString('utf8')) as ApplicationIntakeEnvelope
  if (envelope.version !== 1) throw new Error('Unsupported application intake envelope')
  return envelope
}

export async function createApplicationIntakeReceipt(
  envelope: ApplicationIntakeEnvelope,
  options: {
    keyring: ApplicationIntakeKeyring
    activeKeyId: string
    retentionDays: number
    now?: Date
    putObject?: (key: string, body: Buffer, contentType: string) => Promise<void>
  },
): Promise<ApplicationIntakeReceiptMetadata> {
  const now = options.now ?? new Date()
  if (!Number.isInteger(options.retentionDays) || options.retentionDays < 1 || options.retentionDays > 30) {
    throw new Error('Application intake retention must be between 1 and 30 days')
  }
  const receiptId = randomUUID()
  const createdAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + options.retentionDays * 24 * 60 * 60 * 1000).toISOString()
  const storageKey = `${RECOVERY_PREFIX}/${createdAt.slice(0, 10)}/${receiptId}.json`
  const encrypted = encryptApplicationIntakeEnvelope(
    { ...envelope, capturedAt: createdAt },
    {
      keyring: options.keyring,
      activeKeyId: options.activeKeyId,
      receiptId,
      expiresAt,
    },
  )
  const body = Buffer.from(JSON.stringify(encrypted), 'utf8')
  const putObject = options.putObject ?? uploadToS3
  await putObject(storageKey, body, 'application/octet-stream')
  return {
    receiptId,
    storageKey,
    createdAt,
    expiresAt,
    keyId: encrypted.keyId,
  }
}

export async function deleteApplicationIntakeReceipt(
  receipt: Pick<ApplicationIntakeReceiptMetadata, 'storageKey'>,
  deleteObject: (key: string) => Promise<void> = deleteFromS3,
): Promise<void> {
  await deleteObject(receipt.storageKey)
}

export function isExpectedApplicationIntakeFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const statusCode = (error as { statusCode?: unknown }).statusCode
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
}

export function isApplicationIntakeReceiptExpired(
  receipt: Pick<EncryptedApplicationIntake, 'expiresAt'>,
  now = new Date(),
): boolean {
  return Date.parse(receipt.expiresAt) <= now.getTime()
}

export function applicationIntakeRecoveryPrefix(): string {
  return `${RECOVERY_PREFIX}/`
}
