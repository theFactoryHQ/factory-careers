import { and, eq, inArray, isNull } from 'drizzle-orm'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  application,
  candidate,
  comment,
  document,
  job,
  privacyRequest,
  propertyValue,
} from '../database/schema'
import { logWarn } from './logger'
import { recordActivity } from './recordActivity'
import { deleteFromS3 } from './s3'

export function buildPrivacyRequestPublicResponse() {
  return {
    success: true,
    message: 'If the details match our records, we will send a verification email with next steps.',
  }
}

export function generatePrivacyRequestToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashPrivacyRequestToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function verifyPrivacyRequestToken(token: string, hash: string): boolean {
  const tokenHash = Buffer.from(hashPrivacyRequestToken(token), 'hex')
  const storedHash = Buffer.from(hash, 'hex')
  return tokenHash.length === storedHash.length && timingSafeEqual(tokenHash, storedHash)
}

export async function resolvePrivacyRequestOrganizationId(params: {
  jobSlug?: string
  applicationId?: string
}): Promise<string | null> {
  if (params.applicationId) {
    const app = await db.query.application.findFirst({
      where: eq(application.id, params.applicationId),
      columns: { organizationId: true },
    })
    if (app?.organizationId) return app.organizationId
  }

  if (params.jobSlug) {
    const foundJob = await db.query.job.findFirst({
      where: eq(job.slug, params.jobSlug),
      columns: { organizationId: true },
    })
    if (foundJob?.organizationId) return foundJob.organizationId
  }

  return null
}

export async function canAccessPrivacyRequestForOrg(params: {
  requestId: string
  organizationId: string
}) {
  const direct = await db.query.privacyRequest.findFirst({
    where: and(
      eq(privacyRequest.id, params.requestId),
      eq(privacyRequest.organizationId, params.organizationId),
    ),
  })

  if (direct) return direct

  const unscoped = await db.query.privacyRequest.findFirst({
    where: and(
      eq(privacyRequest.id, params.requestId),
      isNull(privacyRequest.organizationId),
    ),
  })

  if (!unscoped) return null

  const match = await db.query.candidate.findFirst({
    where: and(
      eq(candidate.organizationId, params.organizationId),
      eq(candidate.email, unscoped.requesterEmail),
    ),
    columns: { id: true },
  })

  return match ? unscoped : null
}

export async function findPrivacyRequestCandidateMatches(params: {
  organizationId: string
  requesterEmail: string
}) {
  return db
    .select({
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      createdAt: candidate.createdAt,
    })
    .from(candidate)
    .where(and(
      eq(candidate.organizationId, params.organizationId),
      eq(candidate.email, params.requesterEmail),
    ))
}

export async function deleteCandidatePersonalDataForPrivacyRequest(params: {
  organizationId: string
  candidateIds: string[]
  actorId: string
  privacyRequestId: string
}) {
  const uniqueCandidateIds = Array.from(new Set(params.candidateIds))

  const documentsToDelete = await db.query.document.findMany({
    where: and(
      eq(document.organizationId, params.organizationId),
      inArray(document.candidateId, uniqueCandidateIds),
    ),
    columns: { id: true, storageKey: true },
  })

  const applicationsToDelete = await db.query.application.findMany({
    where: and(
      eq(application.organizationId, params.organizationId),
      inArray(application.candidateId, uniqueCandidateIds),
    ),
    columns: { id: true },
  })
  const applicationIds = applicationsToDelete.map((app) => app.id)

  const deletedCandidateIds = await db.transaction(async (tx) => {
    if (applicationIds.length > 0) {
      await tx.delete(comment).where(and(
        eq(comment.organizationId, params.organizationId),
        eq(comment.targetType, 'application'),
        inArray(comment.targetId, applicationIds),
      ))
      await tx.delete(propertyValue).where(and(
        eq(propertyValue.organizationId, params.organizationId),
        eq(propertyValue.entityType, 'application'),
        inArray(propertyValue.entityId, applicationIds),
      ))
    }

    await tx.delete(comment).where(and(
      eq(comment.organizationId, params.organizationId),
      eq(comment.targetType, 'candidate'),
      inArray(comment.targetId, uniqueCandidateIds),
    ))
    await tx.delete(propertyValue).where(and(
      eq(propertyValue.organizationId, params.organizationId),
      eq(propertyValue.entityType, 'candidate'),
      inArray(propertyValue.entityId, uniqueCandidateIds),
    ))

    const deleted = await tx.delete(candidate)
      .where(and(
        eq(candidate.organizationId, params.organizationId),
        inArray(candidate.id, uniqueCandidateIds),
      ))
      .returning({ id: candidate.id })

    return deleted.map((row) => row.id)
  })

  for (const doc of documentsToDelete) {
    try {
      await deleteFromS3(doc.storageKey)
    } catch (s3Error) {
      logWarn('privacy_request.document_s3_delete_failed', {
        privacy_request_id: params.privacyRequestId,
        document_id: doc.id,
        storage_key: doc.storageKey,
        error_message: s3Error instanceof Error ? s3Error.message : String(s3Error),
      })
    }
  }

  recordActivity({
    organizationId: params.organizationId,
    actorId: params.actorId,
    action: 'deleted',
    resourceType: 'privacy_request',
    resourceId: params.privacyRequestId,
    metadata: {
      deletedCandidateIds,
      deletedApplicationCount: applicationIds.length,
      deletedDocumentCount: documentsToDelete.length,
    },
  })

  return {
    deletedCandidateIds,
    deletedApplicationCount: applicationIds.length,
    deletedDocumentCount: documentsToDelete.length,
  }
}
