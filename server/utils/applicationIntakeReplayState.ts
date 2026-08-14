import { and, eq } from 'drizzle-orm'
import { application, document } from '../database/schema'
import { rollbackPublicApplicationSubmission } from './rollbackPublicApplicationSubmission'

type ExistingReceiptApplication = {
  applicationId: string
  candidateId: string
  documents: Array<{
    storageKey: string
    uploadStatus: 'pending' | 'completed'
  }>
}

type ReplayStateAdapter = {
  findApplication(input: {
    organizationId: string
    receiptId: string
  }): Promise<ExistingReceiptApplication | null>
  rollbackApplication: typeof rollbackPublicApplicationSubmission
}

const databaseAdapter: ReplayStateAdapter = {
  async findApplication(input) {
    const rows = await db.select({
      applicationId: application.id,
      candidateId: application.candidateId,
      storageKey: document.storageKey,
      uploadStatus: document.uploadStatus,
    }).from(application)
      .leftJoin(document, and(
        eq(document.applicationId, application.id),
        eq(document.organizationId, application.organizationId),
      ))
      .where(and(
        eq(application.organizationId, input.organizationId),
        eq(application.recoveryReceiptId, input.receiptId),
      ))
    const first = rows[0]
    if (!first) return null
    return {
      applicationId: first.applicationId,
      candidateId: first.candidateId,
      documents: rows.flatMap(row => row.storageKey && row.uploadStatus
        ? [{ storageKey: row.storageKey, uploadStatus: row.uploadStatus }]
        : []),
    }
  },
  rollbackApplication: rollbackPublicApplicationSubmission,
}

export async function prepareApplicationIntakeReplay(
  input: { organizationId: string, receiptId: string },
  adapter: ReplayStateAdapter = databaseAdapter,
): Promise<{ outcome: 'ready' | 'already_completed' }> {
  const existing = await adapter.findApplication(input)
  if (!existing) return { outcome: 'ready' }
  if (existing.documents.every(item => item.uploadStatus === 'completed')) {
    return { outcome: 'already_completed' }
  }

  const cleanup = await adapter.rollbackApplication({
    applicationId: existing.applicationId,
    candidateId: existing.candidateId,
    organizationId: input.organizationId,
    storageKeys: existing.documents.map(item => item.storageKey),
  })
  if (!cleanup.relationalCleanupSucceeded || !cleanup.storageCleanupSucceeded) {
    throw new Error('Application intake partial replay cleanup failed')
  }
  return { outcome: 'ready' }
}
