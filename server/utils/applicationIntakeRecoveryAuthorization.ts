import { eq } from 'drizzle-orm'
import { job } from '../database/schema'
import {
  deleteApplicationIntakeReceipt,
  isApplicationIntakeReceiptExpired,
  parseApplicationIntakeKeyring,
} from './applicationIntakeRecovery'
import {
  listApplicationIntakeReceiptObjects,
  loadApplicationIntakeReceipt,
  type ApplicationIntakeReceiptListItem,
} from './applicationIntakeRecoveryOperations'

function configuredKeyring() {
  return parseApplicationIntakeKeyring(env.APPLICATION_INTAKE_KEYRING!)
}

async function ownedJobSlugs(organizationId: string): Promise<Set<string>> {
  const rows = await db.select({ slug: job.slug }).from(job)
    .where(eq(job.organizationId, organizationId))
  return new Set(rows.map(row => row.slug))
}

export async function listOwnedApplicationIntakeReceipts(
  organizationId: string,
): Promise<ApplicationIntakeReceiptListItem[]> {
  const slugs = await ownedJobSlugs(organizationId)
  const metadata = await listApplicationIntakeReceiptObjects()
  const owned: ApplicationIntakeReceiptListItem[] = []
  for (const receipt of metadata) {
    const loaded = await loadApplicationIntakeReceipt(receipt.receiptId, configuredKeyring(), {
      knownStorageKey: receipt.storageKey,
      knownEncryptedReceipt: receipt.encrypted,
    })
    if (slugs.has(loaded.envelope.jobSlug)) {
      const { storageKey: _storageKey, encrypted: _encrypted, ...publicMetadata } = receipt
      owned.push(publicMetadata)
    }
  }
  return owned
}

export async function loadOwnedApplicationIntakeReceipt(
  receiptId: string,
  organizationId: string,
) {
  const loaded = await loadApplicationIntakeReceipt(receiptId, configuredKeyring())
  const matchingJob = await db.query.job.findFirst({
    where: (table, { and, eq }) => and(
      eq(table.slug, loaded.envelope.jobSlug),
      eq(table.organizationId, organizationId),
    ),
    columns: { id: true },
  })
  if (!matchingJob) throw createError({ statusCode: 404, statusMessage: 'Recovery receipt not found' })
  return loaded
}

export async function purgeExpiredOwnedApplicationIntakeReceipts(
  organizationId: string,
  now = new Date(),
): Promise<{ scanned: number, purged: number }> {
  const receipts = await listOwnedApplicationIntakeReceipts(organizationId)
  let purged = 0
  for (const receipt of receipts) {
    if (!isApplicationIntakeReceiptExpired(receipt, now)) continue
    const loaded = await loadOwnedApplicationIntakeReceipt(receipt.receiptId, organizationId)
    await deleteApplicationIntakeReceipt({ storageKey: loaded.storageKey })
    purged += 1
  }
  return { scanned: receipts.length, purged }
}
