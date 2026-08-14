import {
  applicationIntakeRecoveryPrefix,
  decryptApplicationIntakeEnvelope,
  isApplicationIntakeReceiptExpired,
  type ApplicationIntakeEnvelope,
  type ApplicationIntakeKeyring,
  type EncryptedApplicationIntake,
} from './applicationIntakeRecovery'
import {
  deleteFromS3,
  downloadFromS3,
  listS3Objects,
  type S3ObjectMetadata,
} from './s3'

const RECEIPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RecoveryStorageDependencies = {
  listObjects?: (prefix: string) => Promise<S3ObjectMetadata[]>
  downloadObject?: (key: string) => Promise<Buffer>
  deleteObject?: (key: string) => Promise<void>
}

export type ApplicationIntakeReceiptListItem = {
  receiptId: string
  createdAt: string
  expiresAt: string
  keyId: string
  sizeBytes?: number
}

function receiptIdFromStorageKey(key: string): string | undefined {
  const match = key.match(/\/([0-9a-f-]{36})\.json$/i)
  return match?.[1] && RECEIPT_ID_PATTERN.test(match[1]) ? match[1] : undefined
}

function parseEncryptedReceipt(bytes: Buffer): EncryptedApplicationIntake {
  const value = JSON.parse(bytes.toString('utf8')) as Partial<EncryptedApplicationIntake>
  if (
    value.version !== 1
    || value.algorithm !== 'aes-256-gcm'
    || typeof value.keyId !== 'string'
    || typeof value.createdAt !== 'string'
    || typeof value.expiresAt !== 'string'
    || typeof value.iv !== 'string'
    || typeof value.authTag !== 'string'
    || typeof value.ciphertext !== 'string'
  ) {
    throw new Error('Invalid application intake recovery object')
  }
  return value as EncryptedApplicationIntake
}

async function storageObjects(deps: RecoveryStorageDependencies): Promise<S3ObjectMetadata[]> {
  return (deps.listObjects ?? listS3Objects)(applicationIntakeRecoveryPrefix())
}

export async function listApplicationIntakeReceipts(
  deps: RecoveryStorageDependencies = {},
): Promise<ApplicationIntakeReceiptListItem[]> {
  const download = deps.downloadObject ?? downloadFromS3
  const objects = await storageObjects(deps)
  const receipts: ApplicationIntakeReceiptListItem[] = []
  for (const object of objects) {
    const receiptId = receiptIdFromStorageKey(object.key)
    if (!receiptId) continue
    const encrypted = parseEncryptedReceipt(await download(object.key))
    receipts.push({
      receiptId,
      createdAt: encrypted.createdAt,
      expiresAt: encrypted.expiresAt,
      keyId: encrypted.keyId,
      sizeBytes: object.sizeBytes,
    })
  }
  return receipts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function loadApplicationIntakeReceipt(
  receiptId: string,
  keyring: ApplicationIntakeKeyring,
  deps: RecoveryStorageDependencies = {},
): Promise<{
  storageKey: string
  encrypted: EncryptedApplicationIntake
  envelope: ApplicationIntakeEnvelope
}> {
  if (!RECEIPT_ID_PATTERN.test(receiptId)) throw new Error('Invalid application intake receipt ID')
  const object = (await storageObjects(deps)).find(item => receiptIdFromStorageKey(item.key) === receiptId)
  if (!object) throw new Error('Application intake receipt was not found')
  const encrypted = parseEncryptedReceipt(await (deps.downloadObject ?? downloadFromS3)(object.key))
  return {
    storageKey: object.key,
    encrypted,
    envelope: decryptApplicationIntakeEnvelope(encrypted, { keyring, receiptId }),
  }
}

export async function replayApplicationIntakeEnvelope(
  envelope: ApplicationIntakeEnvelope,
  options: {
    baseUrl: string
    secret: string
    receiptId: string
    fetchFn?: typeof fetch
  },
): Promise<{ outcome: 'completed' }> {
  const form = new FormData()
  const fields = envelope.fields
  for (const [name, value] of Object.entries({
    firstName: fields.firstName,
    lastName: fields.lastName,
    email: fields.email,
    phone: fields.phone,
    country: fields.country,
    state: fields.state,
    coverLetterText: fields.coverLetterText,
    ref: fields.ref,
    utmSource: fields.utmSource,
    utmMedium: fields.utmMedium,
    utmCampaign: fields.utmCampaign,
    utmTerm: fields.utmTerm,
    utmContent: fields.utmContent,
  })) {
    if (value !== undefined) form.set(name, value)
  }
  form.set('responses', JSON.stringify(envelope.responses))
  if (fields.compliance) form.set('compliance', JSON.stringify(fields.compliance))
  for (const file of envelope.files) {
    form.set(
      file.fieldName,
      new Blob([Buffer.from(file.dataBase64, 'base64')], { type: file.mimeType }),
      file.filename,
    )
  }

  const response = await (options.fetchFn ?? fetch)(
    `${options.baseUrl.replace(/\/$/, '')}/api/public/jobs/${encodeURIComponent(envelope.jobSlug)}/apply`,
    {
      method: 'POST',
      headers: {
        'x-application-intake-replay': '1',
        'x-application-intake-receipt': options.receiptId,
        'x-cron-secret': options.secret,
      },
      body: form,
    },
  )
  await response.json().catch(() => ({}))
  if (response.status === 201) return { outcome: 'completed' }
  throw new Error('Application intake replay failed')
}

export async function purgeExpiredApplicationIntakeReceipts(
  options: RecoveryStorageDependencies & { now?: Date } = {},
): Promise<{ scanned: number, purged: number }> {
  const objects = await storageObjects(options)
  const download = options.downloadObject ?? downloadFromS3
  const deleteObject = options.deleteObject ?? deleteFromS3
  let purged = 0
  for (const object of objects) {
    if (!receiptIdFromStorageKey(object.key)) continue
    const encrypted = parseEncryptedReceipt(await download(object.key))
    if (!isApplicationIntakeReceiptExpired(encrypted, options.now)) continue
    await deleteObject(object.key)
    purged += 1
  }
  return { scanned: objects.length, purged }
}
