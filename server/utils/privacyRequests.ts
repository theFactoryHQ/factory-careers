import { and, eq, exists, inArray, isNull, or } from 'drizzle-orm'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  application,
  candidate,
  comment,
  job,
  privacyRequest,
  propertyValue,
} from '../database/schema'
import { logWarn } from './logger'
import { recordActivity } from './recordActivity'
import { deleteFromS3 } from './s3'
import { env } from './env'
import { prepareCandidateProcessingCascadeInTransaction } from './processingCascadeCleanup'
import type { ProcessingQueueDatabaseExecutor } from './processingQueue'

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

export function resolveFactoryCareersPublicOrigin(): string {
  const explicitUrl = env.BETTER_AUTH_URL?.trim()
  if (explicitUrl) return explicitUrl.replace(/\/+$/, '')

  const platformDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim()
  if (platformDomain) {
    return `https://${platformDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
  }

  return 'https://careers.thefactoryhq.com'
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
  const [request] = await db
    .select()
    .from(privacyRequest)
    .where(and(
      eq(privacyRequest.id, params.requestId),
      or(
        eq(privacyRequest.organizationId, params.organizationId),
        and(
          isNull(privacyRequest.organizationId),
          exists(
            db
              .select({ id: candidate.id })
              .from(candidate)
              .where(and(
                eq(candidate.organizationId, params.organizationId),
                eq(candidate.email, privacyRequest.requesterEmail),
              )),
          ),
        ),
      ),
    ))
    .limit(1)

  return request ?? null
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
  const uniqueCandidateIds = Array.from(new Set(params.candidateIds)).sort()

  const deletion = await db.transaction(async (tx) => {
    const cascade = await prepareCandidateProcessingCascadeInTransaction(
      tx as unknown as ProcessingQueueDatabaseExecutor,
      { organizationId: params.organizationId, candidateIds: uniqueCandidateIds },
    )
    const { applicationIds, candidateIds } = cascade
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

    if (candidateIds.length > 0) {
      await tx.delete(comment).where(and(
        eq(comment.organizationId, params.organizationId),
        eq(comment.targetType, 'candidate'),
        inArray(comment.targetId, candidateIds),
      ))
      await tx.delete(propertyValue).where(and(
        eq(propertyValue.organizationId, params.organizationId),
        eq(propertyValue.entityType, 'candidate'),
        inArray(propertyValue.entityId, candidateIds),
      ))
    }

    const deleted = candidateIds.length > 0
      ? await tx.delete(candidate)
          .where(and(
            eq(candidate.organizationId, params.organizationId),
            inArray(candidate.id, candidateIds),
          ))
          .returning({ id: candidate.id })
      : []

    return { cascade, deletedCandidateIds: deleted.map(row => row.id) }
  })

  const storageResults = await Promise.allSettled(
    deletion.cascade.documents.map(doc => deleteFromS3(doc.storageKey)),
  )
  const failedStorageDeletes = storageResults.filter(result => result.status === 'rejected').length
  if (failedStorageDeletes > 0) {
    logWarn('privacy_request.document_s3_delete_failed', {
      result_code: 'storage_cleanup_failed',
      failed_count: failedStorageDeletes,
    })
  }

  recordActivity({
    organizationId: params.organizationId,
    actorId: params.actorId,
    action: 'deleted',
    resourceType: 'privacy_request',
    resourceId: params.privacyRequestId,
    metadata: {
      deletedCandidateIds: deletion.deletedCandidateIds,
      deletedApplicationCount: deletion.cascade.applicationIds.length,
      deletedDocumentCount: deletion.cascade.documents.length,
    },
  })

  return {
    deletedCandidateIds: deletion.deletedCandidateIds,
    deletedApplicationCount: deletion.cascade.applicationIds.length,
    deletedDocumentCount: deletion.cascade.documents.length,
  }
}
