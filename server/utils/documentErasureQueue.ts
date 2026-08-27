import { createHash } from 'node:crypto'
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { documentErasureQueue } from '../database/schema'
import { db } from './db'

const BASE_RETRY_DELAY_MS = 60_000
const MAX_RETRY_DELAY_MS = 60 * 60_000
const LEASE_DURATION_MS = 2 * 60_000
export const DOCUMENT_ERASURE_CLAIM_LIMIT = 25

export type DocumentErasureQueueRecord = typeof documentErasureQueue.$inferSelect
type EnqueueExecutor = Pick<typeof db, 'insert'>
type QueueDatabase = Pick<typeof db, 'transaction' | 'update' | 'select'>
type QueueTransitionExecutor = Pick<typeof db, 'update'>

type ProviderErrorShape = {
  name?: unknown
  status?: unknown
  statusCode?: unknown
  $metadata?: {
    httpStatusCode?: unknown
  }
}

type DocumentErasureResultCode =
  | 'erased'
  | 'object_absent'
  | 'storage_timeout'
  | 'storage_throttled'
  | 'storage_access_denied'
  | 'storage_unavailable'
  | 'storage_error'
  | 'lease_expired'

const DOCUMENT_ERASURE_RESULT_CODES: Readonly<Record<string, DocumentErasureResultCode>> = {
  erased: 'erased',
  deleted: 'erased',
  object_absent: 'object_absent',
  NoSuchKey: 'object_absent',
  NotFound: 'object_absent',
  storage_timeout: 'storage_timeout',
  ProviderTimeoutError: 'storage_timeout',
  TimeoutError: 'storage_timeout',
  RequestTimeout: 'storage_timeout',
  RequestTimeoutException: 'storage_timeout',
  storage_throttled: 'storage_throttled',
  SlowDown: 'storage_throttled',
  Throttling: 'storage_throttled',
  ThrottlingException: 'storage_throttled',
  TooManyRequestsException: 'storage_throttled',
  storage_access_denied: 'storage_access_denied',
  AccessDenied: 'storage_access_denied',
  AccessDeniedException: 'storage_access_denied',
  Forbidden: 'storage_access_denied',
  storage_unavailable: 'storage_unavailable',
  ServiceUnavailable: 'storage_unavailable',
  ServiceUnavailableException: 'storage_unavailable',
  InternalError: 'storage_unavailable',
  InternalServerError: 'storage_unavailable',
  storage_error: 'storage_error',
  Error: 'storage_error',
  lease_expired: 'lease_expired',
}

export function getDocumentErasureDedupeKey(storageKey: string): string {
  const digest = createHash('md5').update(storageKey).digest('hex')
  return `document-erasure:${digest}`
}

export function sanitizeDocumentErasureResultCode(value: unknown): DocumentErasureResultCode {
  if (typeof value !== 'string') return 'storage_error'
  return Object.hasOwn(DOCUMENT_ERASURE_RESULT_CODES, value)
    ? DOCUMENT_ERASURE_RESULT_CODES[value]!
    : 'storage_error'
}

export function isMissingDocumentObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as ProviderErrorShape
  return candidate.name === 'NoSuchKey'
    || candidate.name === 'NotFound'
    || candidate.status === 404
    || candidate.statusCode === 404
    || candidate.$metadata?.httpStatusCode === 404
}

export function getDocumentErasureResultCode(error: unknown): string {
  if (isMissingDocumentObject(error)) return 'object_absent'
  if (error && typeof error === 'object') {
    const candidate = error as ProviderErrorShape
    const status = candidate.$metadata?.httpStatusCode ?? candidate.statusCode ?? candidate.status
    if (status === 401 || status === 403) return 'storage_access_denied'
    if (status === 408 || status === 504) return 'storage_timeout'
    if (status === 429) return 'storage_throttled'
    if (status === 500 || status === 502 || status === 503) return 'storage_unavailable'
    return sanitizeDocumentErasureResultCode(candidate.name)
  }
  return 'storage_error'
}

export function getDocumentErasureFailureOutcome(input: {
  attemptCount: number
  maxAttempts: number
  now: Date
  resultCode: unknown
}): {
  status: 'pending' | 'failed'
  availableAt: Date
  completedAt: Date | null
  resultCode: string
} {
  const resultCode = sanitizeDocumentErasureResultCode(input.resultCode)
  if (input.attemptCount >= input.maxAttempts) {
    return {
      status: 'failed',
      availableAt: input.now,
      completedAt: input.now,
      resultCode,
    }
  }
  const delay = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, input.attemptCount - 1),
    MAX_RETRY_DELAY_MS,
  )
  return {
    status: 'pending',
    availableAt: new Date(input.now.getTime() + delay),
    completedAt: null,
    resultCode,
  }
}

export async function enqueueDocumentErasure(
  executor: EnqueueExecutor,
  input: {
    organizationId?: string | null
    privacyRequestId?: string | null
    storageKey: string
    now?: Date
    maxAttempts?: number
  },
): Promise<{ id: string } | null> {
  const now = input.now ?? new Date()
  const [inserted] = await executor.insert(documentErasureQueue).values({
    organizationId: input.organizationId ?? null,
    privacyRequestId: input.privacyRequestId ?? null,
    storageKey: input.storageKey,
    dedupeKey: getDocumentErasureDedupeKey(input.storageKey),
    availableAt: now,
    maxAttempts: input.maxAttempts,
  }).onConflictDoUpdate({
    target: documentErasureQueue.dedupeKey,
    set: {
      privacyRequestId: sql`excluded.privacy_request_id`,
      updatedAt: now,
    },
    setWhere: and(
      isNull(documentErasureQueue.privacyRequestId),
      sql`excluded.privacy_request_id is not null`,
    ),
  }).returning({ id: documentErasureQueue.id })
  return inserted ?? null
}

export async function claimDocumentErasures(
  database: QueueDatabase,
  input: {
    now?: Date
    limit?: number
  } = {},
): Promise<DocumentErasureQueueRecord[]> {
  const now = input.now ?? new Date()
  const limit = Math.max(1, Math.min(input.limit ?? DOCUMENT_ERASURE_CLAIM_LIMIT, 100))
  return database.transaction(async (tx) => {
    const exhausted = await tx.select({ id: documentErasureQueue.id })
      .from(documentErasureQueue)
      .where(and(
        eq(documentErasureQueue.status, 'processing'),
        lte(documentErasureQueue.leaseExpiresAt, now),
        sql`${documentErasureQueue.attemptCount} >= ${documentErasureQueue.maxAttempts}`,
      ))
      .orderBy(asc(documentErasureQueue.availableAt), asc(documentErasureQueue.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true })
    if (exhausted.length > 0) {
      await tx.update(documentErasureQueue).set({
        status: 'failed',
        leaseExpiresAt: null,
        resultCode: 'lease_expired',
        completedAt: now,
        updatedAt: now,
      }).where(inArray(documentErasureQueue.id, exhausted.map(row => row.id)))
    }

    // Drizzle emits SELECT ... FOR UPDATE SKIP LOCKED for this bounded claim.
    const claimable = await tx.select().from(documentErasureQueue)
      .where(and(
        sql`${documentErasureQueue.attemptCount} < ${documentErasureQueue.maxAttempts}`,
        or(
          and(
            eq(documentErasureQueue.status, 'pending'),
            lte(documentErasureQueue.availableAt, now),
          ),
          and(
            eq(documentErasureQueue.status, 'processing'),
            lte(documentErasureQueue.leaseExpiresAt, now),
          ),
        ),
      ))
      .orderBy(asc(documentErasureQueue.availableAt), asc(documentErasureQueue.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true })
    if (claimable.length === 0) return []

    return tx.update(documentErasureQueue).set({
      status: 'processing',
      attemptCount: sql`${documentErasureQueue.attemptCount} + 1`,
      leaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      resultCode: null,
      updatedAt: now,
    }).where(inArray(documentErasureQueue.id, claimable.map(row => row.id))).returning()
  })
}

export async function renewDocumentErasureLease(
  database: QueueDatabase,
  input: {
    id: string
    attemptCount: number
    now?: Date
  },
): Promise<boolean> {
  const now = input.now ?? new Date()
  const [renewed] = await database.update(documentErasureQueue).set({
    leaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
    updatedAt: now,
  }).where(and(
    eq(documentErasureQueue.id, input.id),
    eq(documentErasureQueue.status, 'processing'),
    eq(documentErasureQueue.attemptCount, input.attemptCount),
    gt(documentErasureQueue.leaseExpiresAt, now),
  )).returning({ id: documentErasureQueue.id })
  return Boolean(renewed)
}

export async function completeDocumentErasure(
  database: QueueTransitionExecutor,
  input: {
    id: string
    attemptCount: number
    now?: Date
    resultCode: unknown
  },
): Promise<{ id: string; privacyRequestId: string | null } | false> {
  const now = input.now ?? new Date()
  const [completed] = await database.update(documentErasureQueue).set({
    status: 'completed',
    leaseExpiresAt: null,
    resultCode: sanitizeDocumentErasureResultCode(input.resultCode),
    completedAt: now,
    updatedAt: now,
  }).where(and(
    eq(documentErasureQueue.id, input.id),
    eq(documentErasureQueue.status, 'processing'),
    eq(documentErasureQueue.attemptCount, input.attemptCount),
    gt(documentErasureQueue.leaseExpiresAt, now),
  )).returning({
    id: documentErasureQueue.id,
    privacyRequestId: documentErasureQueue.privacyRequestId,
  })
  return completed ?? false
}

export async function recordDocumentErasureFailure(
  database: QueueTransitionExecutor,
  input: {
    id: string
    attemptCount: number
    maxAttempts: number
    now?: Date
    resultCode: unknown
  },
): Promise<boolean> {
  const now = input.now ?? new Date()
  const outcome = getDocumentErasureFailureOutcome({ ...input, now })
  const [transitioned] = await database.update(documentErasureQueue).set({
    ...outcome,
    leaseExpiresAt: null,
    updatedAt: now,
  }).where(and(
    eq(documentErasureQueue.id, input.id),
    eq(documentErasureQueue.status, 'processing'),
    eq(documentErasureQueue.attemptCount, input.attemptCount),
    eq(documentErasureQueue.maxAttempts, input.maxAttempts),
    gt(documentErasureQueue.leaseExpiresAt, now),
  )).returning({ id: documentErasureQueue.id })
  return Boolean(transitioned)
}

export type DocumentErasureOperationsSnapshot = {
  counts: Record<'pending' | 'processing' | 'completed' | 'failed', number>
  oldestPendingAgeSeconds: number | null
  oldestProcessingAgeSeconds: number | null
  resultCodes: Array<{ code: string; count: number }>
}

export async function getDocumentErasureOperationsSnapshot(
  database: Pick<typeof db, 'select'> = db,
  now = new Date(),
): Promise<DocumentErasureOperationsSnapshot> {
  const statusRows = await database.select({
    status: documentErasureQueue.status,
    count: sql<number>`count(*)::int`,
    oldestCreatedAt: sql<Date | null>`min(${documentErasureQueue.createdAt})`,
  }).from(documentErasureQueue).groupBy(documentErasureQueue.status)
  const resultRows = await database.select({
    resultCode: documentErasureQueue.resultCode,
    count: sql<number>`count(*)::int`,
  }).from(documentErasureQueue)
    .where(isNotNull(documentErasureQueue.resultCode))
    .groupBy(documentErasureQueue.resultCode)

  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 }
  let oldestPendingAgeSeconds: number | null = null
  let oldestProcessingAgeSeconds: number | null = null
  for (const row of statusRows) {
    counts[row.status] = Number(row.count)
    const age = row.oldestCreatedAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(row.oldestCreatedAt).getTime()) / 1_000))
      : null
    if (row.status === 'pending') oldestPendingAgeSeconds = age
    if (row.status === 'processing') oldestProcessingAgeSeconds = age
  }

  return {
    counts,
    oldestPendingAgeSeconds,
    oldestProcessingAgeSeconds,
    resultCodes: resultRows
      .map(row => ({ code: sanitizeDocumentErasureResultCode(row.resultCode), count: Number(row.count) }))
      .sort((left, right) => left.code.localeCompare(right.code)),
  }
}
