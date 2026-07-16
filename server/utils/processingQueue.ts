import { and, asc, eq, exists, gt, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
import {
  application,
  document,
  processingBatch,
  processingBatchItem,
  processingTask,
} from '../database/schema'
import { db } from './db'

export const DEFAULT_PROCESSING_TASK_MAX_ATTEMPTS = 5
export const DEFAULT_PROCESSING_TASK_LEASE_MS = 5 * 60 * 1000
export const DEFAULT_PROCESSING_TASK_RETRY_DELAY_MS = 30 * 1000
export const MAX_PROCESSING_TASK_CLAIM_LIMIT = 100
export const DOCUMENT_UPLOAD_RECONCILIATION_GRACE_MS = 15 * 60 * 1000

const MIN_PROCESSING_TASK_LEASE_MS = 1_000
const MAX_PROCESSING_TASK_LEASE_MS = 15 * 60 * 1000
const MAX_PROCESSING_TASK_RETRY_DELAY_MS = 24 * 60 * 60 * 1000
const MIN_PROCESSING_STATUS_RETRY_AFTER_MS = 1_000
const MAX_PROCESSING_STATUS_RETRY_AFTER_MS = 30_000
const RESULT_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/

export type ProcessingTaskType = typeof processingTask.$inferSelect.type
export type ProcessingTaskStatus = typeof processingTask.$inferSelect.status
export type ProcessingTaskRecord = typeof processingTask.$inferSelect
export type ProcessingBatchRecord = typeof processingBatch.$inferSelect
export type ProcessingBatchItemRecord = typeof processingBatchItem.$inferSelect

type ActiveTaskKey = {
  organizationId: string
  type: ProcessingTaskType
  resourceId: string
}

export type ProcessingTaskTarget = Pick<ActiveTaskKey, 'type' | 'resourceId'>

export class ProcessingResourceNotFoundError extends Error {
  readonly code = 'processing_resource_not_found'

  constructor() {
    super('Processing resource was not found')
    this.name = 'ProcessingResourceNotFoundError'
  }
}

export function processingTaskResourceLockKey(
  organizationId: string,
  type: ProcessingTaskType,
  resourceId: string,
): string {
  const resourceType = type === 'application_analysis' ? 'application' : 'document'
  return `processing-resource:${organizationId}:${resourceType}:${resourceId}`
}

type InsertTaskInput = ActiveTaskKey & {
  id: string
  maxAttempts: number
  availableAt: Date
  createdAt: Date
}

type BatchScope = {
  organizationId: string
  batchId: string
}

export type ProcessingQueueDatabaseExecutor = Pick<
  typeof db,
  'select' | 'insert' | 'update' | 'delete' | 'execute'
>

export type ProcessingQueueTransaction = {
  prepareTaskResources(input: {
    organizationId: string
    targets: ProcessingTaskTarget[]
    validate: boolean
  }): Promise<void>
  findBatch(input: BatchScope): Promise<Pick<
    ProcessingBatchRecord,
    'id' | 'organizationId' | 'type' | 'status' | 'sealedAt'
  > | null>
  findActiveTask(input: ActiveTaskKey): Promise<ProcessingTaskRecord | null>
  createBatch(input: {
    id: string
    organizationId: string
    type: ProcessingTaskType
    createdAt: Date
  }): Promise<void>
  insertTask(input: InsertTaskInput): Promise<ProcessingTaskRecord | null>
  findTask(input: { organizationId: string; taskId: string }): Promise<ProcessingTaskRecord | null>
  findBatchItem(input: BatchScope & { resourceId: string }): Promise<ProcessingBatchItemRecord | null>
  linkBatchItem(input: ProcessingBatchItemRecord): Promise<ProcessingBatchItemRecord | null>
  sealBatch(input: BatchScope & { now: Date }): Promise<ProcessingBatchRecord | null>
  lockTask(input: { organizationId: string; taskId: string }): Promise<ProcessingTaskRecord | null>
  lockTasksForCleanup(input: {
    organizationId: string
    taskId: string
    targets: ProcessingTaskTarget[]
  }): Promise<ProcessingTaskRecord[]>
  completeClaimedTask(input: {
    organizationId: string
    taskId: string
    expectedAttemptCount: number
    resultCode: string
    now: Date
  }): Promise<ProcessingTaskRecord | null>
  completePendingUploadTask(input: {
    organizationId: string
    taskId: string
    documentId: string
    now: Date
  }): Promise<ProcessingTaskRecord | null>
  updateTaskFailure(input: {
    organizationId: string
    taskId: string
    status: 'pending' | 'failed'
    availableAt: Date
    resultCode: string
    completedAt: Date | null
    expectedAttemptCount: number
    now: Date
  }): Promise<ProcessingTaskRecord | null>
  renewClaimedTask(input: {
    organizationId: string
    taskId: string
    expectedAttemptCount: number
    leaseExpiresAt: Date
    now: Date
  }): Promise<ProcessingTaskRecord | null>
  cancelTasks(input: {
    organizationId: string
    targets: ProcessingTaskTarget[]
    resultCode: string
    now: Date
  }): Promise<ProcessingTaskRecord[]>
  findBatchIdsForTask(input: {
    organizationId: string
    taskId: string
  }): Promise<string[]>
  refreshBatchStatus(input: BatchScope & { now: Date }): Promise<void>
}

type ClaimTasksInput = {
  organizationId: string
  batchId?: string
  types: ProcessingTaskType[]
  limit: number
  now: Date
  leaseExpiresAt: Date
}

type FindRunnableOrganizationIdsInput = {
  types: ProcessingTaskType[]
  limit: number
  now: Date
  afterOrganizationId?: string
}

type ProcessingBatchStatusSnapshot = {
  batch: ProcessingBatchRecord
  tasks: Array<Pick<
    ProcessingTaskRecord,
    'status' | 'resultCode' | 'attemptCount' | 'availableAt' | 'leaseExpiresAt'
  >>
}

export type ProcessingQueueAdapter = {
  transaction<T>(operation: (
    tx: ProcessingQueueTransaction,
    executor: ProcessingQueueDatabaseExecutor,
  ) => Promise<T>): Promise<T>
  claimTasks(input: ClaimTasksInput): Promise<ProcessingTaskRecord[]>
  findRunnableOrganizationIds(input: FindRunnableOrganizationIdsInput): Promise<string[]>
  readBatchStatus(input: BatchScope): Promise<ProcessingBatchStatusSnapshot | null>
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return fallback
  return Math.floor(value)
}

function normalizeClaimLimit(limit: number | undefined): number {
  return Math.min(normalizePositiveInteger(limit, 10), MAX_PROCESSING_TASK_CLAIM_LIMIT)
}

function normalizeLeaseMs(leaseMs: number | undefined): number {
  return Math.min(
    Math.max(
      normalizePositiveInteger(leaseMs, DEFAULT_PROCESSING_TASK_LEASE_MS),
      MIN_PROCESSING_TASK_LEASE_MS,
    ),
    MAX_PROCESSING_TASK_LEASE_MS,
  )
}

function normalizeResultCode(value: string | undefined, fallback: string): string {
  const resultCode = value ?? fallback
  if (resultCode.length > 64 || !RESULT_CODE_PATTERN.test(resultCode)) {
    throw new Error('Invalid processing result code')
  }
  return resultCode
}

export function documentUploadReconciliationAvailableAt(now = new Date()): Date {
  return new Date(now.getTime() + DOCUMENT_UPLOAD_RECONCILIATION_GRACE_MS)
}

/**
 * Reconciliation is only for an upload reservation that never finalized.
 * Parse state and parsed content are deliberately irrelevant.
 */
export function isDocumentUploadReconciliationEligible(
  candidateDocument: { uploadStatus: 'pending' | 'completed'; createdAt: Date },
  now = new Date(),
): boolean {
  return candidateDocument.uploadStatus === 'pending'
    && candidateDocument.createdAt.getTime()
      <= now.getTime() - DOCUMENT_UPLOAD_RECONCILIATION_GRACE_MS
}

function createDrizzleQueueTransaction(
  executor: ProcessingQueueDatabaseExecutor,
): ProcessingQueueTransaction {
  const queueTx: ProcessingQueueTransaction = {
    async prepareTaskResources(input) {
      const targets = normalizeProcessingTaskTargets(input.targets)
      if (targets.length === 0) return

      const requestedDocumentIds = [...new Set(targets
        .filter(target => target.type !== 'application_analysis')
        .map(target => target.resourceId))].sort()
      const requestedApplicationIds = [...new Set(targets
        .filter(target => target.type === 'application_analysis')
        .map(target => target.resourceId))].sort()
      const referencedDocuments = requestedDocumentIds.length > 0
        ? await executor.select({
            id: document.id,
            applicationId: document.applicationId,
          })
            .from(document)
            .where(and(
              eq(document.organizationId, input.organizationId),
              inArray(document.id, requestedDocumentIds),
            ))
        : []

      const resourceKeys = new Set<string>()
      for (const applicationId of requestedApplicationIds) {
        resourceKeys.add(processingTaskResourceLockKey(
          input.organizationId,
          'application_analysis',
          applicationId,
        ))
      }
      for (const applicationId of referencedDocuments
        .map(row => row.applicationId)
        .filter((value): value is string => value !== null)) {
        resourceKeys.add(processingTaskResourceLockKey(
          input.organizationId,
          'application_analysis',
          applicationId,
        ))
      }
      for (const documentId of requestedDocumentIds) {
        resourceKeys.add(processingTaskResourceLockKey(
          input.organizationId,
          'document_parse',
          documentId,
        ))
      }

      for (const lockKey of [...resourceKeys].sort()) {
        await executor.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
        )
      }

      if (!input.validate) return
      const [validatedDocuments, validatedApplications] = await Promise.all([
        requestedDocumentIds.length > 0
          ? executor.select({ id: document.id })
              .from(document)
              .where(and(
                eq(document.organizationId, input.organizationId),
                inArray(document.id, requestedDocumentIds),
              ))
          : Promise.resolve([]),
        requestedApplicationIds.length > 0
          ? executor.select({ id: application.id })
              .from(application)
              .where(and(
                eq(application.organizationId, input.organizationId),
                inArray(application.id, requestedApplicationIds),
              ))
          : Promise.resolve([]),
      ])
      if (validatedDocuments.length !== requestedDocumentIds.length
        || validatedApplications.length !== requestedApplicationIds.length) {
        throw new ProcessingResourceNotFoundError()
      }
    },

    async findBatch(input) {
      const [batch] = await executor.select({
        id: processingBatch.id,
        organizationId: processingBatch.organizationId,
        type: processingBatch.type,
        status: processingBatch.status,
        sealedAt: processingBatch.sealedAt,
      })
        .from(processingBatch)
        .where(and(
          eq(processingBatch.id, input.batchId),
          eq(processingBatch.organizationId, input.organizationId),
        ))
        .limit(1)
        .for('update')
      return batch ?? null
    },

    async findActiveTask(input) {
      const [task] = await executor.select()
        .from(processingTask)
        .where(and(
          eq(processingTask.organizationId, input.organizationId),
          eq(processingTask.type, input.type),
          eq(processingTask.resourceId, input.resourceId),
          inArray(processingTask.status, ['pending', 'processing']),
        ))
        .limit(1)
      return task ?? null
    },

    async createBatch(input) {
      await executor.insert(processingBatch).values({
        id: input.id,
        organizationId: input.organizationId,
        type: input.type,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
    },

    async insertTask(input) {
      const [task] = await executor.insert(processingTask)
        .values({
          id: input.id,
          organizationId: input.organizationId,
          type: input.type,
          resourceId: input.resourceId,
          maxAttempts: input.maxAttempts,
          availableAt: input.availableAt,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .onConflictDoNothing()
        .returning()
      return task ?? null
    },

    async findTask(input) {
      const [task] = await executor.select()
        .from(processingTask)
        .where(and(
          eq(processingTask.id, input.taskId),
          eq(processingTask.organizationId, input.organizationId),
        ))
        .limit(1)
      return task ?? null
    },

    async findBatchItem(input) {
      const [item] = await executor.select()
        .from(processingBatchItem)
        .where(and(
          eq(processingBatchItem.organizationId, input.organizationId),
          eq(processingBatchItem.batchId, input.batchId),
          eq(processingBatchItem.resourceId, input.resourceId),
        ))
        .limit(1)
      return item ?? null
    },

    async linkBatchItem(input) {
      const [item] = await executor.insert(processingBatchItem)
        .values(input)
        .onConflictDoNothing()
        .returning()
      return item ?? null
    },

    async sealBatch(input) {
      const batch = await queueTx.findBatch(input)
      if (!batch) return null
      if (batch.sealedAt) throw new Error('Processing batch is already sealed')
      await executor.update(processingBatch)
        .set({ sealedAt: input.now, updatedAt: input.now })
        .where(and(
          eq(processingBatch.id, input.batchId),
          eq(processingBatch.organizationId, input.organizationId),
        ))
      await queueTx.refreshBatchStatus(input)
      const [sealed] = await executor.select()
        .from(processingBatch)
        .where(and(
          eq(processingBatch.id, input.batchId),
          eq(processingBatch.organizationId, input.organizationId),
        ))
        .limit(1)
      return sealed ?? null
    },

    async lockTask(input) {
      const [task] = await executor.select()
        .from(processingTask)
        .where(and(
          eq(processingTask.id, input.taskId),
          eq(processingTask.organizationId, input.organizationId),
        ))
        .limit(1)
        .for('update')
      return task ?? null
    },

    async lockTasksForCleanup(input) {
      const targets = normalizeProcessingTaskTargets(input.targets)
      const targetPredicate = targets.length > 0
        ? or(...targets.map(target => and(
            eq(processingTask.type, target.type),
            eq(processingTask.resourceId, target.resourceId),
          )))
        : undefined
      return executor.select()
        .from(processingTask)
        .where(and(
          eq(processingTask.organizationId, input.organizationId),
          targetPredicate
            ? or(
                eq(processingTask.id, input.taskId),
                and(
                  targetPredicate,
                  inArray(processingTask.status, ['pending', 'processing']),
                ),
              )
            : eq(processingTask.id, input.taskId),
        ))
        .orderBy(asc(processingTask.id))
        .for('update')
    },

    async completeClaimedTask(input) {
      const [task] = await executor.update(processingTask)
        .set({
          status: 'completed',
          leaseExpiresAt: null,
          resultCode: input.resultCode,
          completedAt: input.now,
          updatedAt: input.now,
        })
        .where(and(
          eq(processingTask.id, input.taskId),
          eq(processingTask.organizationId, input.organizationId),
          eq(processingTask.status, 'processing'),
          eq(processingTask.attemptCount, input.expectedAttemptCount),
        ))
        .returning()
      return task ?? null
    },

    async completePendingUploadTask(input) {
      const [task] = await executor.update(processingTask)
        .set({
          status: 'completed',
          leaseExpiresAt: null,
          resultCode: 'upload_completed',
          completedAt: input.now,
          updatedAt: input.now,
        })
        .where(and(
          eq(processingTask.id, input.taskId),
          eq(processingTask.organizationId, input.organizationId),
          eq(processingTask.type, 'document_upload_reconciliation'),
          eq(processingTask.resourceId, input.documentId),
          eq(processingTask.status, 'pending'),
        ))
        .returning()
      return task ?? null
    },

    async updateTaskFailure(input) {
      const [task] = await executor.update(processingTask)
        .set({
          status: input.status,
          availableAt: input.availableAt,
          leaseExpiresAt: null,
          resultCode: input.resultCode,
          completedAt: input.completedAt,
          updatedAt: input.now,
        })
        .where(and(
          eq(processingTask.id, input.taskId),
          eq(processingTask.organizationId, input.organizationId),
          eq(processingTask.status, 'processing'),
          eq(processingTask.attemptCount, input.expectedAttemptCount),
        ))
        .returning()
      return task ?? null
    },

    async renewClaimedTask(input) {
      const [task] = await executor.update(processingTask)
        .set({ leaseExpiresAt: input.leaseExpiresAt, updatedAt: input.now })
        .where(and(
          eq(processingTask.id, input.taskId),
          eq(processingTask.organizationId, input.organizationId),
          eq(processingTask.status, 'processing'),
          eq(processingTask.attemptCount, input.expectedAttemptCount),
        ))
        .returning()
      return task ?? null
    },

    async cancelTasks(input) {
      if (input.targets.length === 0) return []
      const targetPredicate = or(...input.targets.map(target => and(
        eq(processingTask.type, target.type),
        eq(processingTask.resourceId, target.resourceId),
      )))
      const rows = await executor.select({ id: processingTask.id })
        .from(processingTask)
        .where(and(
          eq(processingTask.organizationId, input.organizationId),
          targetPredicate,
          inArray(processingTask.status, ['pending', 'processing']),
        ))
        .orderBy(asc(processingTask.id))
        .for('update')
      if (rows.length === 0) return []
      return executor.update(processingTask)
        .set({
          status: 'cancelled',
          leaseExpiresAt: null,
          resultCode: input.resultCode,
          completedAt: input.now,
          updatedAt: input.now,
        })
        .where(and(
          eq(processingTask.organizationId, input.organizationId),
          inArray(processingTask.id, rows.map(row => row.id)),
          inArray(processingTask.status, ['pending', 'processing']),
        ))
        .returning()
    },

    async findBatchIdsForTask(input) {
      const rows = await executor.select({ batchId: processingBatchItem.batchId })
        .from(processingBatchItem)
        .where(and(
          eq(processingBatchItem.organizationId, input.organizationId),
          eq(processingBatchItem.taskId, input.taskId),
        ))
      return [...new Set(rows.map(row => row.batchId))].sort()
    },

    async refreshBatchStatus(input) {
      const [batch] = await executor.select()
        .from(processingBatch)
        .where(and(
          eq(processingBatch.id, input.batchId),
          eq(processingBatch.organizationId, input.organizationId),
        ))
        .limit(1)
        .for('update')
      if (!batch) return
      const tasks = await executor.select({ status: processingTask.status })
        .from(processingBatchItem)
        .innerJoin(processingTask, and(
          eq(processingTask.id, processingBatchItem.taskId),
          eq(processingTask.organizationId, processingBatchItem.organizationId),
        ))
        .where(and(
          eq(processingBatchItem.organizationId, input.organizationId),
          eq(processingBatchItem.batchId, input.batchId),
        ))
      const totalTasks = tasks.length
      const completedTasks = tasks.filter(task => task.status === 'completed').length
      const failedTasks = tasks.filter(task => task.status === 'failed').length
      const cancelledTasks = tasks.filter(task => task.status === 'cancelled').length
      const isTerminal = !!batch.sealedAt
        && completedTasks + failedTasks + cancelledTasks === totalTasks
      const status: ProcessingTaskStatus = !batch.sealedAt
        ? 'pending'
        : isTerminal && failedTasks > 0
          ? 'failed'
          : isTerminal && cancelledTasks > 0
            ? 'cancelled'
            : isTerminal
              ? 'completed'
              : tasks.some(task => task.status === 'processing')
                ? 'processing'
                : 'pending'
      await executor.update(processingBatch)
        .set({
          status,
          totalTasks,
          completedTasks,
          failedTasks,
          cancelledTasks,
          startedAt: status === 'processing' && !batch.startedAt ? input.now : batch.startedAt,
          completedAt: isTerminal ? input.now : null,
          updatedAt: input.now,
        })
        .where(and(
          eq(processingBatch.id, input.batchId),
          eq(processingBatch.organizationId, input.organizationId),
        ))
    },
  }
  return queueTx
}

async function refreshBatchesForTask(
  tx: ProcessingQueueTransaction,
  input: { organizationId: string; taskId: string; now: Date },
): Promise<void> {
  const batchIds = await tx.findBatchIdsForTask(input)
  for (const batchId of batchIds) {
    await tx.refreshBatchStatus({ organizationId: input.organizationId, batchId, now: input.now })
  }
}

/** @internal Exported so PostgreSQL integration tests can use an isolated database. */
export function createDrizzleProcessingQueueAdapter(
  database: typeof db,
): ProcessingQueueAdapter {
  return {
  transaction: operation => database.transaction(async (executor) => {
    const databaseExecutor = executor as unknown as ProcessingQueueDatabaseExecutor
    return operation(createDrizzleQueueTransaction(databaseExecutor), databaseExecutor)
  }),

  async claimTasks(input) {
    return database.transaction(async (executor) => {
      const hasSealedBatch = exists(
        executor.select({ value: sql`1` })
          .from(processingBatchItem)
          .innerJoin(processingBatch, and(
            eq(processingBatch.id, processingBatchItem.batchId),
            eq(processingBatch.organizationId, processingBatchItem.organizationId),
          ))
          .where(and(
            eq(processingBatchItem.organizationId, processingTask.organizationId),
            eq(processingBatchItem.taskId, processingTask.id),
            input.batchId ? eq(processingBatchItem.batchId, input.batchId) : undefined,
            isNotNull(processingBatch.sealedAt),
          )),
      )
      const exhausted = await executor.select({ id: processingTask.id })
        .from(processingTask)
        .where(and(
          eq(processingTask.organizationId, input.organizationId),
          inArray(processingTask.type, input.types),
          eq(processingTask.status, 'processing'),
          lte(processingTask.leaseExpiresAt, input.now),
          sql`${processingTask.attemptCount} >= ${processingTask.maxAttempts}`,
          hasSealedBatch,
        ))
        .orderBy(asc(processingTask.leaseExpiresAt), asc(processingTask.createdAt))
        .limit(input.limit)
        .for('update', { skipLocked: true })
      const queueTx = createDrizzleQueueTransaction(
        executor as unknown as ProcessingQueueDatabaseExecutor,
      )
      if (exhausted.length > 0) {
        const failed = await executor.update(processingTask)
          .set({
            status: 'failed',
            leaseExpiresAt: null,
            resultCode: 'lease_expired',
            completedAt: input.now,
            updatedAt: input.now,
          })
          .where(and(
            eq(processingTask.organizationId, input.organizationId),
            inArray(processingTask.id, exhausted.map(task => task.id)),
          ))
          .returning({ id: processingTask.id })
        for (const task of failed) {
          await refreshBatchesForTask(queueTx, {
            organizationId: input.organizationId,
            taskId: task.id,
            now: input.now,
          })
        }
      }

      const claimable = await executor.select({ id: processingTask.id })
        .from(processingTask)
        .where(and(
          eq(processingTask.organizationId, input.organizationId),
          inArray(processingTask.type, input.types),
          sql`${processingTask.attemptCount} < ${processingTask.maxAttempts}`,
          hasSealedBatch,
          or(
            and(eq(processingTask.status, 'pending'), lte(processingTask.availableAt, input.now)),
            and(eq(processingTask.status, 'processing'), lte(processingTask.leaseExpiresAt, input.now)),
          ),
        ))
        .orderBy(asc(processingTask.availableAt), asc(processingTask.createdAt))
        .limit(input.limit)
        .for('update', { skipLocked: true })
      if (claimable.length === 0) return []
      const claimed = await executor.update(processingTask)
        .set({
          status: 'processing',
          attemptCount: sql`${processingTask.attemptCount} + 1`,
          leaseExpiresAt: input.leaseExpiresAt,
          resultCode: null,
          updatedAt: input.now,
        })
        .where(and(
          eq(processingTask.organizationId, input.organizationId),
          inArray(processingTask.id, claimable.map(task => task.id)),
        ))
        .returning()
      // Drizzle emits SELECT ... FOR UPDATE SKIP LOCKED for the bounded claim.
      for (const task of claimed) {
        await refreshBatchesForTask(queueTx, {
          organizationId: input.organizationId,
          taskId: task.id,
          now: input.now,
        })
      }
      return claimed
    })
  },

  async findRunnableOrganizationIds(input) {
    const hasSealedBatch = exists(
      database.select({ value: sql`1` })
        .from(processingBatchItem)
        .innerJoin(processingBatch, and(
          eq(processingBatch.id, processingBatchItem.batchId),
          eq(processingBatch.organizationId, processingBatchItem.organizationId),
        ))
        .where(and(
          eq(processingBatchItem.organizationId, processingTask.organizationId),
          eq(processingBatchItem.taskId, processingTask.id),
          isNotNull(processingBatch.sealedAt),
        )),
    )
    const rows = await database.selectDistinct({ organizationId: processingTask.organizationId })
      .from(processingTask)
      .where(and(
        inArray(processingTask.type, input.types),
        input.afterOrganizationId
          ? gt(processingTask.organizationId, input.afterOrganizationId)
          : undefined,
        hasSealedBatch,
        or(
          and(
            eq(processingTask.status, 'pending'),
            lte(processingTask.availableAt, input.now),
            sql`${processingTask.attemptCount} < ${processingTask.maxAttempts}`,
          ),
          and(
            eq(processingTask.status, 'processing'),
            lte(processingTask.leaseExpiresAt, input.now),
          ),
        ),
      ))
      .orderBy(asc(processingTask.organizationId))
      .limit(input.limit)
    return rows.map(row => row.organizationId)
  },

  async readBatchStatus(input) {
    const [batch] = await database.select()
      .from(processingBatch)
      .where(and(
        eq(processingBatch.id, input.batchId),
        eq(processingBatch.organizationId, input.organizationId),
      ))
      .limit(1)
    if (!batch) return null
    const tasks = await database.select({
      status: processingTask.status,
      resultCode: processingTask.resultCode,
      attemptCount: processingTask.attemptCount,
      availableAt: processingTask.availableAt,
      leaseExpiresAt: processingTask.leaseExpiresAt,
    })
      .from(processingBatchItem)
      .innerJoin(processingTask, and(
        eq(processingTask.id, processingBatchItem.taskId),
        eq(processingTask.organizationId, processingBatchItem.organizationId),
      ))
      .where(and(
        eq(processingBatchItem.organizationId, input.organizationId),
        eq(processingBatchItem.batchId, input.batchId),
      ))
    return { batch, tasks }
  },
}
}

const drizzleQueueAdapter = createDrizzleProcessingQueueAdapter(db)

export type EnqueueProcessingTaskInput = ActiveTaskKey & {
  batchId?: string
  maxAttempts?: number
  availableAt?: Date
  now?: Date
}

type EnqueueWithinResult = {
  task: ProcessingTaskRecord
  item: ProcessingBatchItemRecord
  batchId: string
  created: boolean
  linked: boolean
}

async function enqueueWithinTransaction(
  input: EnqueueProcessingTaskInput,
  tx: ProcessingQueueTransaction,
  resourcesPrepared = false,
): Promise<EnqueueWithinResult> {
  const now = input.now ?? new Date()
  const batchId = input.batchId ?? crypto.randomUUID()
  const ownsBatch = !input.batchId
  if (!resourcesPrepared) {
    await tx.prepareTaskResources({
      organizationId: input.organizationId,
      targets: [{ type: input.type, resourceId: input.resourceId }],
      validate: true,
    })
  }
  if (ownsBatch) {
    await tx.createBatch({
      id: batchId,
      organizationId: input.organizationId,
      type: input.type,
      createdAt: now,
    })
  }
  const batch = await tx.findBatch({ batchId, organizationId: input.organizationId })
  if (!batch) throw new Error('Processing batch was not found')
  if (batch.type !== input.type) throw new Error('Processing batch type does not match task type')
  if (batch.sealedAt) throw new Error('Processing batch is sealed')

  const existingItem = await tx.findBatchItem({
    organizationId: input.organizationId,
    batchId,
    resourceId: input.resourceId,
  })
  if (existingItem) {
    // The batch is already locked. This task lookup must remain non-locking:
    // completion owns the inverse task -> linked batches lock sequence.
    const existingTask = await tx.findTask({
      organizationId: input.organizationId,
      taskId: existingItem.taskId,
    })
    if (!existingTask) throw new Error('Processing batch item task was not found')
    return {
      task: existingTask,
      item: existingItem,
      batchId,
      created: false,
      linked: false,
    }
  }

  let task = await tx.findActiveTask(input)
  let created = false
  if (!task) {
    task = await tx.insertTask({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      type: input.type,
      resourceId: input.resourceId,
      maxAttempts: normalizePositiveInteger(input.maxAttempts, DEFAULT_PROCESSING_TASK_MAX_ATTEMPTS),
      availableAt: input.availableAt ?? now,
      createdAt: now,
    })
    if (task) created = true
    else task = await tx.findActiveTask(input)
    if (!task) throw new Error('Active processing task conflict could not be resolved')
  }

  const itemInput: ProcessingBatchItemRecord = {
    organizationId: input.organizationId,
    batchId,
    resourceId: input.resourceId,
    taskId: task.id,
    createdAt: now,
  }
  const insertedItem = await tx.linkBatchItem(itemInput)
  if (!insertedItem) throw new Error('Processing batch membership conflict')
  await tx.refreshBatchStatus({ organizationId: input.organizationId, batchId, now })
  if (ownsBatch) {
    const sealed = await tx.sealBatch({ organizationId: input.organizationId, batchId, now })
    if (!sealed) throw new Error('Processing batch was not found')
  }
  return {
    task,
    item: insertedItem,
    batchId,
    created,
    linked: !!insertedItem,
  }
}

export async function createProcessingBatch(
  input: { id?: string; organizationId: string; type: ProcessingTaskType; now?: Date },
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<ProcessingBatchRecord> {
  const id = input.id ?? crypto.randomUUID()
  const now = input.now ?? new Date()
  await adapter.transaction(tx => tx.createBatch({
    id,
    organizationId: input.organizationId,
    type: input.type,
    createdAt: now,
  }))
  return {
    id,
    organizationId: input.organizationId,
    type: input.type,
    status: 'pending',
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    cancelledTasks: 0,
    createdAt: now,
    startedAt: null,
    sealedAt: null,
    completedAt: null,
    updatedAt: now,
  }
}

export async function enqueueProcessingTask(
  input: EnqueueProcessingTaskInput,
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<EnqueueWithinResult> {
  return adapter.transaction(tx => enqueueWithinTransaction(input, tx))
}

export async function enqueueProcessingTaskInTransaction(
  executor: ProcessingQueueDatabaseExecutor,
  input: EnqueueProcessingTaskInput,
): Promise<EnqueueWithinResult> {
  return enqueueWithinTransaction(input, createDrizzleQueueTransaction(executor))
}

export async function sealProcessingBatch(
  input: BatchScope & { now?: Date },
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<ProcessingBatchRecord> {
  return adapter.transaction(async (tx) => {
    const batch = await tx.sealBatch({ ...input, now: input.now ?? new Date() })
    if (!batch) throw new Error('Processing batch was not found')
    return batch
  })
}

export type EnqueueProcessingBatchResult = {
  batch: ProcessingBatchRecord
  tasks: ProcessingTaskRecord[]
  createdTasks: ProcessingTaskRecord[]
  items: ProcessingBatchItemRecord[]
}

/** Create every membership and seal the batch in one transaction. */
export async function enqueueProcessingBatch(
  input: {
    id?: string
    organizationId: string
    type: ProcessingTaskType
    resourceIds: string[]
    maxAttempts?: number
    availableAt?: Date
    now?: Date
  },
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<EnqueueProcessingBatchResult> {
  return adapter.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const batchId = input.id ?? crypto.randomUUID()
    const resourceIds = [...new Set(input.resourceIds)].sort()
    await tx.prepareTaskResources({
      organizationId: input.organizationId,
      targets: resourceIds.map(resourceId => ({ type: input.type, resourceId })),
      validate: true,
    })
    await tx.createBatch({
      id: batchId,
      organizationId: input.organizationId,
      type: input.type,
      createdAt: now,
    })
    const tasks: ProcessingTaskRecord[] = []
    const createdTasks: ProcessingTaskRecord[] = []
    const items: ProcessingBatchItemRecord[] = []
    // Stable lock order avoids deadlocks for overlapping concurrent batches.
    for (const resourceId of resourceIds) {
      const result = await enqueueWithinTransaction({
        organizationId: input.organizationId,
        type: input.type,
        resourceId,
        batchId,
        maxAttempts: input.maxAttempts,
        availableAt: input.availableAt,
        now,
      }, tx, true)
      tasks.push(result.task)
      items.push(result.item)
      if (result.created) createdTasks.push(result.task)
    }
    const batch = await tx.sealBatch({ organizationId: input.organizationId, batchId, now })
    if (!batch) throw new Error('Processing batch was not found')
    return { batch, tasks, createdTasks, items }
  })
}

export type ClaimProcessingTasksInput = {
  organizationId: string
  batchId?: string
  types: ProcessingTaskType[]
  limit?: number
  leaseMs?: number
  now?: Date
}

export async function claimProcessingTasks(
  input: ClaimProcessingTasksInput,
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<ProcessingTaskRecord[]> {
  if (input.types.length === 0) return []
  const now = input.now ?? new Date()
  return adapter.claimTasks({
    organizationId: input.organizationId,
    batchId: input.batchId,
    types: [...new Set(input.types)],
    limit: normalizeClaimLimit(input.limit),
    now,
    leaseExpiresAt: new Date(now.getTime() + normalizeLeaseMs(input.leaseMs)),
  })
}

export type FindRunnableProcessingOrganizationIdsInput = {
  types: ProcessingTaskType[]
  limit?: number
  now?: Date
  afterOrganizationId?: string
}

export async function findRunnableProcessingOrganizationIds(
  input: FindRunnableProcessingOrganizationIdsInput,
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<string[]> {
  if (input.types.length === 0) return []
  return adapter.findRunnableOrganizationIds({
    types: [...new Set(input.types)],
    limit: normalizeClaimLimit(input.limit),
    now: input.now ?? new Date(),
    afterOrganizationId: input.afterOrganizationId,
  })
}

export type ProcessingBatchStatus = {
  batchId: string
  type: ProcessingTaskType
  status: ProcessingTaskStatus
  counts: {
    pending: number
    processing: number
    succeeded: number
    failed: number
    cancelled: number
    attempted: number
    total: number
  }
  errorsByCode: Record<string, number>
  retryAfterMs: number | null
  timestamps: {
    createdAt: Date
    startedAt: Date | null
    sealedAt: Date | null
    completedAt: Date | null
    updatedAt: Date
  }
}

function sanitizedProcessingResultCode(resultCode: string | null): string {
  return resultCode
    && resultCode.length <= 64
    && RESULT_CODE_PATTERN.test(resultCode)
    ? resultCode
    : 'processing_failed'
}

export async function getProcessingBatchStatus(
  input: BatchScope & { now?: Date },
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<ProcessingBatchStatus | null> {
  const snapshot = await adapter.readBatchStatus(input)
  if (!snapshot) return null

  const counts = {
    pending: snapshot.tasks.filter(task => task.status === 'pending').length,
    processing: snapshot.tasks.filter(task => task.status === 'processing').length,
    succeeded: snapshot.tasks.filter(task => task.status === 'completed').length,
    failed: snapshot.tasks.filter(task => task.status === 'failed').length,
    cancelled: snapshot.tasks.filter(task => task.status === 'cancelled').length,
    attempted: snapshot.tasks.filter(task => task.attemptCount > 0).length,
    total: snapshot.tasks.length,
  }
  const errorCounts = new Map<string, number>()
  for (const task of snapshot.tasks) {
    if (task.status !== 'failed') continue
    const code = sanitizedProcessingResultCode(task.resultCode)
    errorCounts.set(code, (errorCounts.get(code) ?? 0) + 1)
  }
  const terminal = ['completed', 'failed', 'cancelled'].includes(snapshot.batch.status)
  const now = input.now ?? new Date()
  const nextRunnableAt = snapshot.tasks
    .flatMap((task) => {
      if (task.status === 'pending') return [task.availableAt]
      if (task.status === 'processing' && task.leaseExpiresAt) return [task.leaseExpiresAt]
      return []
    })
    .sort((left, right) => left.getTime() - right.getTime())[0]
  const retryAfterMs = terminal
    ? null
    : Math.min(
        Math.max(
          nextRunnableAt ? nextRunnableAt.getTime() - now.getTime() : 0,
          MIN_PROCESSING_STATUS_RETRY_AFTER_MS,
        ),
        MAX_PROCESSING_STATUS_RETRY_AFTER_MS,
      )

  return {
    batchId: snapshot.batch.id,
    type: snapshot.batch.type,
    status: snapshot.batch.status,
    counts,
    errorsByCode: Object.fromEntries([...errorCounts].sort(([left], [right]) =>
      left.localeCompare(right),
    )),
    retryAfterMs,
    timestamps: {
      createdAt: snapshot.batch.createdAt,
      startedAt: snapshot.batch.startedAt,
      sealedAt: snapshot.batch.sealedAt,
      completedAt: snapshot.batch.completedAt,
      updatedAt: snapshot.batch.updatedAt,
    },
  }
}

export type CompleteProcessingTaskInput = {
  organizationId: string
  taskId: string
  expectedAttemptCount: number
  resultCode?: string
  now?: Date
}

function assertCurrentProcessingLease(
  task: ProcessingTaskRecord,
  expectedAttemptCount: number,
  now: Date,
): void {
  if (task.status !== 'processing'
    || task.attemptCount !== expectedAttemptCount
    || !task.leaseExpiresAt
    || task.leaseExpiresAt <= now) {
    throw new Error('Processing task lease is stale')
  }
}

async function completeWithinTransaction<T>(
  input: CompleteProcessingTaskInput,
  tx: ProcessingQueueTransaction,
  executor: ProcessingQueueDatabaseExecutor,
  operation: (
    executor: ProcessingQueueDatabaseExecutor,
    task: ProcessingTaskRecord,
  ) => Promise<T>,
  resultCodeFromResult?: (result: T) => string,
): Promise<{ task: ProcessingTaskRecord; result: T } | null> {
  const now = input.now ?? new Date()
  const locked = await tx.lockTask(input)
  if (!locked) return null
  assertCurrentProcessingLease(locked, input.expectedAttemptCount, now)
  const result = await operation(executor, locked)
  const resultCode = resultCodeFromResult?.(result) ?? input.resultCode
  const completed = await tx.completeClaimedTask({
    organizationId: input.organizationId,
    taskId: input.taskId,
    expectedAttemptCount: input.expectedAttemptCount,
    resultCode: normalizeResultCode(resultCode, 'completed'),
    now,
  })
  if (!completed) throw new Error('Processing task lease is stale')
  await refreshBatchesForTask(tx, {
    organizationId: input.organizationId,
    taskId: completed.id,
    now,
  })
  return { task: completed, result }
}

export async function completeProcessingTaskWithDomainWrite<T>(
  input: CompleteProcessingTaskInput,
  operation: (
    executor: ProcessingQueueDatabaseExecutor,
    task: ProcessingTaskRecord,
  ) => Promise<T>,
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<{ task: ProcessingTaskRecord; result: T } | null> {
  return adapter.transaction(async (tx, executor) => {
    return completeWithinTransaction(input, tx, executor, operation)
  })
}

export type ProcessingTaskDomainOutcome<T> = {
  result: T
  resultCode: string
}

/** Complete a task with a code derived atomically from its domain write result. */
export async function completeProcessingTaskWithDomainOutcome<T>(
  input: Omit<CompleteProcessingTaskInput, 'resultCode'>,
  operation: (
    executor: ProcessingQueueDatabaseExecutor,
    task: ProcessingTaskRecord,
  ) => Promise<ProcessingTaskDomainOutcome<T>>,
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<{ task: ProcessingTaskRecord; result: T } | null> {
  return adapter.transaction(async (tx, executor) => {
    const completed = await completeWithinTransaction(
      input,
      tx,
      executor,
      operation,
      outcome => outcome.resultCode,
    )
    return completed
      ? { task: completed.task, result: completed.result.result }
      : null
  })
}

export type ProcessingResourceCleanupPreparation<T> = {
  cancellationTargets: ProcessingTaskTarget[]
  value: T
}

/**
 * Atomically terminalize sibling work and perform destructive domain cleanup.
 *
 * Lock order is resource advisory locks, then every affected task row in stable
 * ID order, then domain rows. The preparation callback must only read the
 * resource-fenced domain state needed to discover sibling task targets.
 */
export async function completeProcessingTaskWithResourceCleanup<TPrepared, TResult>(
  input: CompleteProcessingTaskInput & {
    resourceTargets: ProcessingTaskTarget[]
    cancellationResultCode?: string
  },
  prepare: (
    executor: ProcessingQueueDatabaseExecutor,
  ) => Promise<ProcessingResourceCleanupPreparation<TPrepared>>,
  operation: (
    executor: ProcessingQueueDatabaseExecutor,
    task: ProcessingTaskRecord,
    prepared: TPrepared,
  ) => Promise<TResult>,
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<{ task: ProcessingTaskRecord; result: TResult } | null> {
  return adapter.transaction(async (tx, executor) => {
    const now = input.now ?? new Date()
    await tx.prepareTaskResources({
      organizationId: input.organizationId,
      targets: input.resourceTargets,
      validate: false,
    })
    const preparation = await prepare(executor)
    const cancellationTargets = normalizeProcessingTaskTargets(preparation.cancellationTargets)
    const lockedTasks = await tx.lockTasksForCleanup({
      organizationId: input.organizationId,
      taskId: input.taskId,
      targets: cancellationTargets,
    })
    const currentTask = lockedTasks.find(task => task.id === input.taskId)
    if (!currentTask) return null
    assertCurrentProcessingLease(currentTask, input.expectedAttemptCount, now)

    const siblingTargets = cancellationTargets.filter(target =>
      target.type !== currentTask.type || target.resourceId !== currentTask.resourceId,
    )
    const cancelled = siblingTargets.length > 0
      ? await tx.cancelTasks({
          organizationId: input.organizationId,
          targets: siblingTargets,
          resultCode: normalizeResultCode(input.cancellationResultCode, 'resource_removed'),
          now,
        })
      : []
    for (const task of [...cancelled].sort((left, right) => left.id.localeCompare(right.id))) {
      await refreshBatchesForTask(tx, {
        organizationId: input.organizationId,
        taskId: task.id,
        now,
      })
    }

    const result = await operation(executor, currentTask, preparation.value)
    const completed = await tx.completeClaimedTask({
      organizationId: input.organizationId,
      taskId: input.taskId,
      expectedAttemptCount: input.expectedAttemptCount,
      resultCode: normalizeResultCode(input.resultCode, 'completed'),
      now,
    })
    if (!completed) throw new Error('Processing task lease is stale')
    await refreshBatchesForTask(tx, {
      organizationId: input.organizationId,
      taskId: completed.id,
      now,
    })
    return { task: completed, result }
  })
}

export async function completeProcessingTask(
  input: CompleteProcessingTaskInput,
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<ProcessingTaskRecord | null> {
  const completed = await completeProcessingTaskWithDomainWrite(
    input,
    async () => undefined,
    adapter,
  )
  return completed?.task ?? null
}

export async function completeProcessingTaskInTransaction(
  executor: ProcessingQueueDatabaseExecutor,
  input: CompleteProcessingTaskInput,
): Promise<ProcessingTaskRecord | null> {
  const completed = await completeWithinTransaction(
    input,
    createDrizzleQueueTransaction(executor),
    executor,
    async () => undefined,
  )
  return completed?.task ?? null
}

export async function renewProcessingTaskLease(
  input: {
    organizationId: string
    taskId: string
    expectedAttemptCount: number
    leaseMs?: number
    now?: Date
  },
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<ProcessingTaskRecord | null> {
  return adapter.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const task = await tx.lockTask(input)
    if (!task) return null
    assertCurrentProcessingLease(task, input.expectedAttemptCount, now)
    const renewed = await tx.renewClaimedTask({
      organizationId: input.organizationId,
      taskId: input.taskId,
      expectedAttemptCount: input.expectedAttemptCount,
      leaseExpiresAt: new Date(now.getTime() + normalizeLeaseMs(input.leaseMs)),
      now,
    })
    if (!renewed) throw new Error('Processing task lease is stale')
    return renewed
  })
}

export type FailProcessingTaskInput = {
  organizationId: string
  taskId: string
  expectedAttemptCount: number
  resultCode: string
  retryable?: boolean
  baseRetryDelayMs?: number
  now?: Date
}

async function failWithinTransaction<T>(
  input: FailProcessingTaskInput,
  tx: ProcessingQueueTransaction,
  executor: ProcessingQueueDatabaseExecutor,
  operation: (
    executor: ProcessingQueueDatabaseExecutor,
    task: ProcessingTaskRecord,
  ) => Promise<T>,
): Promise<{ task: ProcessingTaskRecord; result: T } | null> {
  const now = input.now ?? new Date()
  const task = await tx.lockTask(input)
  if (!task) return null
  assertCurrentProcessingLease(task, input.expectedAttemptCount, now)
  const terminal = input.retryable === false || task.attemptCount >= task.maxAttempts
  const baseDelayMs = normalizePositiveInteger(
    input.baseRetryDelayMs,
    DEFAULT_PROCESSING_TASK_RETRY_DELAY_MS,
  )
  const retryDelayMs = Math.min(
    baseDelayMs * (2 ** Math.max(0, task.attemptCount - 1)),
    MAX_PROCESSING_TASK_RETRY_DELAY_MS,
  )
  const resultCode = normalizeResultCode(input.resultCode, 'processing_failed')
  // The task lock is deliberately acquired before the domain callback. The
  // callback may update domain state, but must not enqueue additional work.
  const result = await operation(executor, task)
  const updated = await tx.updateTaskFailure({
    organizationId: input.organizationId,
    taskId: input.taskId,
    status: terminal ? 'failed' : 'pending',
    availableAt: terminal ? now : new Date(now.getTime() + retryDelayMs),
    resultCode,
    completedAt: terminal ? now : null,
    expectedAttemptCount: input.expectedAttemptCount,
    now,
  })
  if (!updated) throw new Error('Processing task lease is stale')
  await refreshBatchesForTask(tx, {
    organizationId: input.organizationId,
    taskId: updated.id,
    now,
  })
  return { task: updated, result }
}

export async function failProcessingTaskWithDomainWrite<T>(
  input: FailProcessingTaskInput,
  operation: (
    executor: ProcessingQueueDatabaseExecutor,
    task: ProcessingTaskRecord,
  ) => Promise<T>,
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<{ task: ProcessingTaskRecord; result: T } | null> {
  return adapter.transaction((tx, executor) =>
    failWithinTransaction(input, tx, executor, operation),
  )
}

export async function failProcessingTask(
  input: FailProcessingTaskInput,
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<ProcessingTaskRecord | null> {
  const failed = await failProcessingTaskWithDomainWrite(
    input,
    async () => undefined,
    adapter,
  )
  return failed?.task ?? null
}

export type PendingUploadReconciliationCompletionOutcome =
  | 'completed'
  | 'processing'
  | 'failed'
  | 'cancelled'

export type CompletePendingUploadReconciliationTaskInput = {
  organizationId: string
  taskId: string
  documentId: string
  now?: Date
}

type CompletePendingUploadWithDomainWriteResult<T> = {
  outcome: PendingUploadReconciliationCompletionOutcome
  task: ProcessingTaskRecord
  result: T | null
  operationRan: boolean
}

async function completePendingUploadWithDomainWriteWithinTransaction<T>(
  input: CompletePendingUploadReconciliationTaskInput,
  tx: ProcessingQueueTransaction,
  executor: ProcessingQueueDatabaseExecutor,
  operation: (
    executor: ProcessingQueueDatabaseExecutor,
    task: ProcessingTaskRecord,
  ) => Promise<T>,
): Promise<CompletePendingUploadWithDomainWriteResult<T>> {
  const now = input.now ?? new Date()
  // Global lock invariant: task rows are locked before any application/document
  // row in the callback. Batch-first paths never take task row locks; cancellation
  // locks all target tasks by ID before refreshing linked batches.
  const task = await tx.lockTask(input)
  if (!task) throw new Error('Document upload reconciliation task was not found')
  if (task.type !== 'document_upload_reconciliation' || task.resourceId !== input.documentId) {
    throw new Error('Processing task does not match the document upload')
  }
  if (task.status === 'failed' || task.status === 'cancelled') {
    throw new Error('Upload reconciliation task is terminal')
  }
  if (task.status === 'completed') {
    return { outcome: 'completed', task, result: null, operationRan: false }
  }
  const result = await operation(executor, task)
  if (task.status === 'processing') {
    return { outcome: 'processing', task, result, operationRan: true }
  }
  const completed = await tx.completePendingUploadTask({ ...input, now })
  if (!completed) throw new Error('Document upload reconciliation task state changed unexpectedly')
  await refreshBatchesForTask(tx, {
    organizationId: input.organizationId,
    taskId: completed.id,
    now,
  })
  return { outcome: 'completed', task: completed, result, operationRan: true }
}

async function completePendingUploadWithinTransaction(
  input: CompletePendingUploadReconciliationTaskInput,
  tx: ProcessingQueueTransaction,
): Promise<{
  outcome: PendingUploadReconciliationCompletionOutcome
  task: ProcessingTaskRecord
}> {
  const now = input.now ?? new Date()
  const task = await tx.lockTask(input)
  if (!task) throw new Error('Document upload reconciliation task was not found')
  if (task.type !== 'document_upload_reconciliation' || task.resourceId !== input.documentId) {
    throw new Error('Processing task does not match the document upload')
  }
  if (task.status !== 'pending') return { outcome: task.status, task }
  const completed = await tx.completePendingUploadTask({ ...input, now })
  if (!completed) throw new Error('Document upload reconciliation task state changed unexpectedly')
  await refreshBatchesForTask(tx, {
    organizationId: input.organizationId,
    taskId: completed.id,
    now,
  })
  return { outcome: 'completed', task: completed }
}

export async function completePendingUploadReconciliationTask(
  input: CompletePendingUploadReconciliationTaskInput,
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<{
  outcome: PendingUploadReconciliationCompletionOutcome
  task: ProcessingTaskRecord
}> {
  return adapter.transaction(tx => completePendingUploadWithinTransaction(input, tx))
}

export async function completePendingUploadReconciliationTaskInTransaction(
  executor: ProcessingQueueDatabaseExecutor,
  input: CompletePendingUploadReconciliationTaskInput,
): Promise<{
  outcome: PendingUploadReconciliationCompletionOutcome
  task: ProcessingTaskRecord
}> {
  return completePendingUploadWithinTransaction(
    input,
    createDrizzleQueueTransaction(executor),
  )
}

export async function completePendingUploadReconciliationTaskWithDomainWrite<T>(
  input: CompletePendingUploadReconciliationTaskInput,
  operation: (
    executor: ProcessingQueueDatabaseExecutor,
    task: ProcessingTaskRecord,
  ) => Promise<T>,
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<CompletePendingUploadWithDomainWriteResult<T>> {
  return adapter.transaction((tx, executor) =>
    completePendingUploadWithDomainWriteWithinTransaction(input, tx, executor, operation),
  )
}

export async function completePendingUploadReconciliationTaskWithDomainWriteInTransaction<T>(
  executor: ProcessingQueueDatabaseExecutor,
  input: CompletePendingUploadReconciliationTaskInput,
  operation: (
    executor: ProcessingQueueDatabaseExecutor,
    task: ProcessingTaskRecord,
  ) => Promise<T>,
): Promise<CompletePendingUploadWithDomainWriteResult<T>> {
  return completePendingUploadWithDomainWriteWithinTransaction(
    input,
    createDrizzleQueueTransaction(executor),
    executor,
    operation,
  )
}

function normalizeProcessingTaskTargets(targets: ProcessingTaskTarget[]): ProcessingTaskTarget[] {
  const uniqueTargets = new Map<string, ProcessingTaskTarget>()
  for (const target of targets) uniqueTargets.set(`${target.type}:${target.resourceId}`, target)
  return [...uniqueTargets.values()].sort((left, right) =>
    left.type.localeCompare(right.type) || left.resourceId.localeCompare(right.resourceId),
  )
}

async function cancelTasksWithinTransaction(
  tx: ProcessingQueueTransaction,
  input: {
    organizationId: string
    targets: ProcessingTaskTarget[]
    resultCode: string
    now?: Date
  },
): Promise<ProcessingTaskRecord[]> {
  const targets = normalizeProcessingTaskTargets(input.targets)
  if (targets.length === 0) return []
  const now = input.now ?? new Date()
  await tx.prepareTaskResources({
    organizationId: input.organizationId,
    targets,
    validate: false,
  })
  const cancelled = await tx.cancelTasks({
    organizationId: input.organizationId,
    targets,
    resultCode: normalizeResultCode(input.resultCode, 'resource_removed'),
    now,
  })
  for (const task of [...cancelled].sort((left, right) => left.id.localeCompare(right.id))) {
    await refreshBatchesForTask(tx, {
      organizationId: input.organizationId,
      taskId: task.id,
      now,
    })
  }
  return cancelled
}

/** Cancel active work without deleting its durable task or membership history. */
export async function cancelProcessingTasks(
  input: {
    organizationId: string
    targets: ProcessingTaskTarget[]
    resultCode: string
    now?: Date
  },
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<ProcessingTaskRecord[]> {
  return adapter.transaction(tx => cancelTasksWithinTransaction(tx, input))
}

export async function cancelProcessingTasksInTransaction(
  executor: ProcessingQueueDatabaseExecutor,
  input: {
    organizationId: string
    targets: ProcessingTaskTarget[]
    resultCode: string
    now?: Date
  },
): Promise<ProcessingTaskRecord[]> {
  return cancelTasksWithinTransaction(createDrizzleQueueTransaction(executor), input)
}

/** Cancel active document work without deleting its durable task or membership history. */
export async function cancelDocumentProcessingTasks(
  input: { organizationId: string; documentIds: string[]; now?: Date },
  adapter: ProcessingQueueAdapter = drizzleQueueAdapter,
): Promise<ProcessingTaskRecord[]> {
  const targets = [...new Set(input.documentIds)].flatMap(resourceId => [
    { type: 'document_parse' as const, resourceId },
    { type: 'document_upload_reconciliation' as const, resourceId },
  ])
  return cancelProcessingTasks({
    organizationId: input.organizationId,
    targets,
    resultCode: 'resource_removed',
    now: input.now,
  }, adapter)
}

export async function cancelDocumentProcessingTasksInTransaction(
  executor: ProcessingQueueDatabaseExecutor,
  input: { organizationId: string; documentIds: string[]; now?: Date },
): Promise<ProcessingTaskRecord[]> {
  const targets = [...new Set(input.documentIds)].flatMap(resourceId => [
    { type: 'document_parse' as const, resourceId },
    { type: 'document_upload_reconciliation' as const, resourceId },
  ])
  return cancelProcessingTasksInTransaction(executor, {
    organizationId: input.organizationId,
    targets,
    resultCode: 'resource_removed',
    now: input.now,
  })
}
