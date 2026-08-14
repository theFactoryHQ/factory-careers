import { and, eq, sql } from 'drizzle-orm'
import { application, candidate, document } from '../database/schema'
import { db } from './db'
import { rollbackPublicApplicationSubmission } from './rollbackPublicApplicationSubmission'

export async function cleanupApplicationCanary(email: string): Promise<{
  ok: boolean
  residualRecords: number
}> {
  if (!/^factory-careers-canary\+[a-z0-9-]+@example\.com$/i.test(email)) {
    throw new Error('Invalid application canary identity')
  }

  let storageCleanupSucceeded = true
  const candidates = await db.select({ id: candidate.id, organizationId: candidate.organizationId })
    .from(candidate)
    .where(eq(candidate.email, email.toLowerCase()))

  for (const canaryCandidate of candidates) {
    const applications = await db.select({ id: application.id })
      .from(application)
      .where(and(
        eq(application.organizationId, canaryCandidate.organizationId),
        eq(application.candidateId, canaryCandidate.id),
      ))
    for (const canaryApplication of applications) {
      const documents = await db.select({ storageKey: document.storageKey })
        .from(document)
        .where(and(
          eq(document.organizationId, canaryCandidate.organizationId),
          eq(document.applicationId, canaryApplication.id),
        ))
      const result = await rollbackPublicApplicationSubmission({
        applicationId: canaryApplication.id,
        candidateId: canaryCandidate.id,
        organizationId: canaryCandidate.organizationId,
        storageKeys: documents.map(item => item.storageKey),
      })
      storageCleanupSucceeded &&= result.storageCleanupSucceeded
    }

    await db.delete(candidate).where(and(
      eq(candidate.id, canaryCandidate.id),
      eq(candidate.organizationId, canaryCandidate.organizationId),
      sql`NOT EXISTS (SELECT 1 FROM ${application} WHERE ${application.candidateId} = ${candidate.id})`,
      sql`NOT EXISTS (SELECT 1 FROM ${document} WHERE ${document.candidateId} = ${candidate.id})`,
    ))
  }

  const [residual] = await db.select({ count: sql<number>`count(*)::int` })
    .from(candidate)
    .where(eq(candidate.email, email.toLowerCase()))
  const residualRecords = residual?.count ?? 0
  return { ok: storageCleanupSucceeded && residualRecords === 0, residualRecords }
}
