import { createHash } from 'node:crypto'
import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm'
import { documentErasureQueue } from '../database/schema'
import { db } from './db'

const BASE_RETRY_DELAY_MS = 60_000
const MAX_RETRY_DELAY_MS = 60 * 60_000
const LEASE_DURATION_MS = 2 * 60_000
export const DOCUMENT_ERASURE_CLAIM_LIMIT = 25

type QueueRecord = typeof documentErasureQueue.$inferSelect
type EnqueueExecutor = Pick<typeof db, 'insert'>
type QueueDatabase = Pick<typeof db, 'transaction' | 'update'>

type ProviderErrorShape = {
  name?: unknown
  status?: unknown
  statusCode?: unknown
  $metadata?: {
    httpStatusCode?: unknown
  }
}

export function getDocumentErasureDedupeKey(storageKey: string): string {
  const digest = createHash('md5').update(storageKey).digest('hex')
  return `document-erasure:${digest}`
}

export function sanitizeDocumentErasureResultCode(
  value: unknown,
  fallback = 'storage_error',
): string {
  if (typeof value !== 'string' || value.trim() === '') return fallback
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)) return fallback
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
  return normalized || fallback
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
  if (error instanceof Error) {
    return sanitizeDocumentErasureResultCode(error.name)
  }
  if (error && typeof error === 'object') {
    return sanitizeDocumentErasureResultCode((error as ProviderErrorShape).name)
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
  const [inserted] = await executor.insert(documentErasureQueue).values({
    organizationId: input.organizationId ?? null,
    privacyRequestId: input.privacyRequestId ?? null,
    storageKey: input.storageKey,
    dedupeKey: getDocumentErasureDedupeKey(input.storageKey),
    availableAt: input.now ?? new Date(),
    maxAttempts: input.maxAttempts,
  }).onConflictDoNothing({
    target: documentErasureQueue.dedupeKey,
  }).returning({ id: documentErasureQueue.id })
  return inserted ?? null
}

export async function claimDocumentErasures(
  database: QueueDatabase,
  input: {
    now?: Date
    limit?: number
  } = {},
): Promise<QueueRecord[]> {
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
  )).returning({ id: documentErasureQueue.id })
  return Boolean(renewed)
}

export async function completeDocumentErasure(
  database: QueueDatabase,
  input: {
    id: string
    attemptCount: number
    now?: Date
    resultCode: unknown
  },
): Promise<boolean> {
  const now = input.now ?? new Date()
  const [completed] = await database.update(documentErasureQueue).set({
    status: 'completed',
    leaseExpiresAt: null,
    resultCode: sanitizeDocumentErasureResultCode(input.resultCode, 'erased'),
    completedAt: now,
    updatedAt: now,
  }).where(and(
    eq(documentErasureQueue.id, input.id),
    eq(documentErasureQueue.status, 'processing'),
    eq(documentErasureQueue.attemptCount, input.attemptCount),
  )).returning({ id: documentErasureQueue.id })
  return Boolean(completed)
}

export async function recordDocumentErasureFailure(
  database: QueueDatabase,
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
  )).returning({ id: documentErasureQueue.id })
  return Boolean(transitioned)
}
