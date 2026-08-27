import { and, eq, exists, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createError } from 'h3'
import {
  application,
  candidate,
  comment,
  documentErasureQueue,
  job,
  privacyRequest,
  propertyValue,
} from '../database/schema'
import { recordActivity } from './recordActivity'
import { db } from './db'
import { env } from './env'
import { enqueueDocumentErasure } from './documentErasureQueue'
import { prepareCandidateProcessingCascadeInTransaction } from './processingCascadeCleanup'
import type { ProcessingQueueDatabaseExecutor } from './processingQueue'
import {
  buildPrivacyRequestErasureSummary,
  type PrivacyRequestErasureSummary,
} from '../../shared/privacyRequestErasure'

type PrivacyRequestStatus = typeof privacyRequest.$inferSelect.status
const TERMINAL_PRIVACY_REQUEST_STATUSES = new Set<PrivacyRequestStatus>(['completed', 'denied', 'cancelled'])

export function assertPrivacyRequestFulfillableStatus(status: PrivacyRequestStatus): void {
  if (!TERMINAL_PRIVACY_REQUEST_STATUSES.has(status)) return
  throw createError({ statusCode: 409, statusMessage: 'Privacy request has a terminal disposition' })
}

export function assertPrivacyRequestStatusTransition(
  currentStatus: PrivacyRequestStatus,
  nextStatus: PrivacyRequestStatus,
): void {
  if (!TERMINAL_PRIVACY_REQUEST_STATUSES.has(currentStatus) || currentStatus === nextStatus) return
  throw createError({ statusCode: 409, statusMessage: 'Privacy request has a terminal disposition' })
}

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

export async function getPrivacyRequestErasureSummaries(
  requestIds: string[],
  executor: Pick<typeof db, 'select'> = db,
): Promise<Map<string, PrivacyRequestErasureSummary>> {
  const summaries = new Map<string, PrivacyRequestErasureSummary>()
  if (requestIds.length === 0) return summaries
  const rows = await executor.select({
    privacyRequestId: documentErasureQueue.privacyRequestId,
    status: documentErasureQueue.status,
    count: sql<number>`count(*)::int`,
  }).from(documentErasureQueue)
    .where(inArray(documentErasureQueue.privacyRequestId, requestIds))
    .groupBy(documentErasureQueue.privacyRequestId, documentErasureQueue.status)

  const grouped = new Map<string, Array<{ status: typeof documentErasureQueue.$inferSelect.status; count: number }>>()
  for (const row of rows) {
    if (!row.privacyRequestId) continue
    const group = grouped.get(row.privacyRequestId) ?? []
    group.push({ status: row.status, count: Number(row.count) })
    grouped.set(row.privacyRequestId, group)
  }
  for (const requestId of requestIds) {
    summaries.set(requestId, buildPrivacyRequestErasureSummary(grouped.get(requestId) ?? []))
  }
  return summaries
}

export async function deleteCandidatePersonalDataForPrivacyRequest(params: {
  organizationId: string
  candidateIds: string[]
  actorId: string
  privacyRequestId: string
  resolutionNotes?: string
}) {
  const uniqueCandidateIds = Array.from(new Set(params.candidateIds)).sort()

  const deletion = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(privacyRequest).where(and(
      eq(privacyRequest.id, params.privacyRequestId),
      or(
        eq(privacyRequest.organizationId, params.organizationId),
        isNull(privacyRequest.organizationId),
      ),
    )).limit(1).for('update')
    if (!request) {
      throw createError({ statusCode: 404, statusMessage: 'Privacy request not found' })
    }
    if (!request.verifiedAt) {
      throw createError({ statusCode: 409, statusMessage: 'Privacy request must be verified before fulfillment' })
    }
    assertPrivacyRequestFulfillableStatus(request.status)

    const matchingCandidates = await tx.select({ id: candidate.id }).from(candidate).where(and(
      eq(candidate.organizationId, params.organizationId),
      eq(candidate.email, request.requesterEmail),
      inArray(candidate.id, params.candidateIds),
    )).orderBy(candidate.id).for('update')
    if (matchingCandidates.length !== params.candidateIds.length) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Selected candidates must match the verified requester email and active organization',
      })
    }

    const now = new Date()
    await tx.update(privacyRequest).set({
      status: 'in_review',
      reviewedById: request.reviewedById ?? params.actorId,
      reviewedAt: request.reviewedAt ?? now,
      completedById: null,
      completedAt: null,
      resolutionNotes: params.resolutionNotes ?? request.resolutionNotes,
      updatedAt: now,
    }).where(eq(privacyRequest.id, request.id))

    const cascade = await prepareCandidateProcessingCascadeInTransaction(
      tx as unknown as ProcessingQueueDatabaseExecutor,
      { organizationId: params.organizationId, candidateIds: uniqueCandidateIds },
    )
    const { applicationIds, candidateIds } = cascade
    for (const doc of cascade.documents) {
      await enqueueDocumentErasure(tx, {
        organizationId: params.organizationId,
        privacyRequestId: request.id,
        storageKey: doc.storageKey,
        now,
      })
    }
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

    const completion = await reconcilePrivacyRequestErasureCompletionInTransaction(tx, {
      privacyRequestId: request.id,
      completedById: params.actorId,
      now,
    })
    if (!completion) throw new Error('Privacy request disappeared during fulfillment')
    return { cascade, deletedCandidateIds: deleted.map(row => row.id), completion }
  })

  recordActivity({
    organizationId: params.organizationId,
    actorId: params.actorId,
    action: 'deleted',
    resourceType: 'privacy_request',
    resourceId: params.privacyRequestId,
    metadata: {
      deletedCandidateCount: deletion.deletedCandidateIds.length,
      deletedApplicationCount: deletion.cascade.applicationIds.length,
      deletedDocumentCount: deletion.cascade.documents.length,
    },
  })

  return {
    deletedCandidateIds: deletion.deletedCandidateIds,
    deletedApplicationCount: deletion.cascade.applicationIds.length,
    deletedDocumentCount: deletion.cascade.documents.length,
    erasureStatus: deletion.completion.status === 'completed' ? 'completed' : 'pending',
    request: deletion.completion,
  }
}

type PrivacyCompletionExecutor = Pick<typeof db, 'select' | 'update'>

export async function reconcilePrivacyRequestErasureCompletionInTransaction(
  executor: PrivacyCompletionExecutor,
  input: { privacyRequestId: string; completedById?: string | null; now?: Date },
) {
  const now = input.now ?? new Date()
  const [request] = await executor.select().from(privacyRequest)
    .where(eq(privacyRequest.id, input.privacyRequestId))
    .limit(1)
    .for('update')
  if (!request) return null
  if (TERMINAL_PRIVACY_REQUEST_STATUSES.has(request.status)) return request

  const [unfinished] = await executor.select({ id: documentErasureQueue.id })
    .from(documentErasureQueue)
    .where(and(
      eq(documentErasureQueue.privacyRequestId, input.privacyRequestId),
      ne(documentErasureQueue.status, 'completed'),
    ))
    .limit(1)
  const completed = !unfinished
  const [updated] = await executor.update(privacyRequest).set({
    status: completed ? 'completed' : 'in_review',
    completedById: completed ? (input.completedById ?? request.reviewedById) : null,
    completedAt: completed ? now : null,
    updatedAt: now,
  }).where(and(
    eq(privacyRequest.id, input.privacyRequestId),
    ne(privacyRequest.status, 'completed'),
  )).returning()
  return updated ?? request
}
