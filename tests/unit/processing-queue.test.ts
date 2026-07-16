import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as queue from '../../server/utils/processingQueue'
import type {
  ProcessingBatchItemRecord,
  ProcessingBatchRecord,
  ProcessingQueueAdapter,
  ProcessingQueueDatabaseExecutor,
  ProcessingQueueTransaction,
  ProcessingTaskRecord,
} from '../../server/utils/processingQueue'

const readProjectFile = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

type State = {
  tasks: Map<string, ProcessingTaskRecord>
  batches: Map<string, ProcessingBatchRecord>
  items: Map<string, ProcessingBatchItemRecord>
  domainWrites: string[]
}

const itemKey = (item: { organizationId: string; batchId: string; resourceId: string }) =>
  `${item.organizationId}:${item.batchId}:${item.resourceId}`

function cloneState(state: State): State {
  return {
    tasks: new Map([...state.tasks].map(([id, task]) => [id, { ...task }])),
    batches: new Map([...state.batches].map(([id, batch]) => [id, { ...batch }])),
    items: new Map([...state.items].map(([id, item]) => [id, { ...item }])),
    domainWrites: [...state.domainWrites],
  }
}

function createQueueAdapter(options: { missingResourceIds?: string[] } = {}) {
  const state: State = {
    tasks: new Map(),
    batches: new Map(),
    items: new Map(),
    domainWrites: [],
  }
  let transactionQueue = Promise.resolve()

  const createTransaction = (working: State): ProcessingQueueTransaction => ({
    async prepareTaskResources(input) {
      if (input.validate && input.targets.some(target =>
        options.missingResourceIds?.includes(target.resourceId),
      )) {
        throw new queue.ProcessingResourceNotFoundError()
      }
    },
    async findBatch(input) {
      const batch = working.batches.get(input.batchId)
      return batch?.organizationId === input.organizationId ? batch : null
    },
    async findActiveTask(input) {
      return [...working.tasks.values()].find(task =>
        task.organizationId === input.organizationId
        && task.type === input.type
        && task.resourceId === input.resourceId
        && (task.status === 'pending' || task.status === 'processing'),
      ) ?? null
    },
    async createBatch(input) {
      working.batches.set(input.id, {
        ...input,
        status: 'pending',
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        cancelledTasks: 0,
        startedAt: null,
        sealedAt: null,
        completedAt: null,
        updatedAt: input.createdAt,
      })
    },
    async insertTask(input) {
      if ([...working.tasks.values()].some(task =>
        task.organizationId === input.organizationId
        && task.type === input.type
        && task.resourceId === input.resourceId
        && (task.status === 'pending' || task.status === 'processing'),
      )) return null
      const task: ProcessingTaskRecord = {
        id: input.id,
        organizationId: input.organizationId,
        type: input.type,
        resourceId: input.resourceId,
        status: 'pending',
        attemptCount: 0,
        maxAttempts: input.maxAttempts,
        availableAt: input.availableAt,
        leaseExpiresAt: null,
        resultCode: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        completedAt: null,
      }
      working.tasks.set(task.id, task)
      return task
    },
    async findTask(input) {
      const task = working.tasks.get(input.taskId)
      return task?.organizationId === input.organizationId ? task : null
    },
    async findBatchItem(input) {
      return working.items.get(itemKey(input)) ?? null
    },
    async linkBatchItem(input) {
      const key = itemKey(input)
      if (working.items.has(key)) return null
      const item: ProcessingBatchItemRecord = { ...input }
      working.items.set(key, item)
      return item
    },
    async sealBatch(input) {
      const batch = working.batches.get(input.batchId)
      if (!batch || batch.organizationId !== input.organizationId) return null
      if (batch.sealedAt) throw new Error('Processing batch is already sealed')
      batch.sealedAt = input.now
      await createTransaction(working).refreshBatchStatus(input)
      return { ...batch }
    },
    async lockTask(input) {
      const task = working.tasks.get(input.taskId)
      return task?.organizationId === input.organizationId ? task : null
    },
    async completeClaimedTask(input) {
      const task = working.tasks.get(input.taskId)
      if (!task || task.organizationId !== input.organizationId
        || task.status !== 'processing'
        || task.attemptCount !== input.expectedAttemptCount) return null
      Object.assign(task, {
        status: 'completed',
        leaseExpiresAt: null,
        resultCode: input.resultCode,
        completedAt: input.now,
        updatedAt: input.now,
      })
      return task
    },
    async completePendingUploadTask(input) {
      const task = working.tasks.get(input.taskId)
      if (!task || task.organizationId !== input.organizationId
        || task.type !== 'document_upload_reconciliation'
        || task.resourceId !== input.documentId
        || task.status !== 'pending') return null
      Object.assign(task, {
        status: 'completed',
        resultCode: 'upload_completed',
        completedAt: input.now,
        updatedAt: input.now,
      })
      return task
    },
    async updateTaskFailure(input) {
      const task = working.tasks.get(input.taskId)
      if (!task || task.organizationId !== input.organizationId
        || task.status !== 'processing'
        || task.attemptCount !== input.expectedAttemptCount) return null
      Object.assign(task, {
        status: input.status,
        availableAt: input.availableAt,
        leaseExpiresAt: null,
        resultCode: input.resultCode,
        completedAt: input.completedAt,
        updatedAt: input.now,
      })
      return task
    },
    async renewClaimedTask(input) {
      const task = working.tasks.get(input.taskId)
      if (!task || task.organizationId !== input.organizationId
        || task.status !== 'processing'
        || task.attemptCount !== input.expectedAttemptCount) return null
      task.leaseExpiresAt = input.leaseExpiresAt
      task.updatedAt = input.now
      return task
    },
    async cancelTasks(input) {
      const cancelled: ProcessingTaskRecord[] = []
      for (const task of working.tasks.values()) {
        if (task.organizationId === input.organizationId
          && input.targets.some(target =>
            target.type === task.type && target.resourceId === task.resourceId,
          )
          && (task.status === 'pending' || task.status === 'processing')) {
          Object.assign(task, {
            status: 'cancelled',
            leaseExpiresAt: null,
            resultCode: input.resultCode,
            completedAt: input.now,
            updatedAt: input.now,
          })
          cancelled.push(task)
        }
      }
      return cancelled
    },
    async findBatchIdsForTask(input) {
      return [...new Set([...working.items.values()]
        .filter(item => item.organizationId === input.organizationId && item.taskId === input.taskId)
        .map(item => item.batchId))].sort()
    },
    async refreshBatchStatus(input) {
      const batch = working.batches.get(input.batchId)
      if (!batch || batch.organizationId !== input.organizationId) return
      const statuses = [...working.items.values()]
        .filter(item => item.organizationId === input.organizationId && item.batchId === input.batchId)
        .map(item => working.tasks.get(item.taskId)!.status)
      batch.totalTasks = statuses.length
      batch.completedTasks = statuses.filter(status => status === 'completed').length
      batch.failedTasks = statuses.filter(status => status === 'failed').length
      batch.cancelledTasks = statuses.filter(status => status === 'cancelled').length
      const terminal = !!batch.sealedAt
        && batch.completedTasks + batch.failedTasks + batch.cancelledTasks === batch.totalTasks
      batch.status = !batch.sealedAt
        ? 'pending'
        : terminal && batch.failedTasks > 0
          ? 'failed'
          : terminal && batch.cancelledTasks > 0
            ? 'cancelled'
            : terminal
              ? 'completed'
              : statuses.includes('processing')
                ? 'processing'
                : 'pending'
      if (batch.status === 'processing' && !batch.startedAt) batch.startedAt = input.now
      batch.completedAt = terminal ? input.now : null
      batch.updatedAt = input.now
    },
  })

  const fakeExecutor = (working: State) => ({
    async execute() {
      working.domainWrites.push('domain-write')
      return []
    },
  }) as unknown as ProcessingQueueDatabaseExecutor

  const adapter = {
    transaction: async <T>(operation: (
      tx: ProcessingQueueTransaction,
      executor: ProcessingQueueDatabaseExecutor,
    ) => Promise<T>) => {
      let release!: () => void
      const previous = transactionQueue
      transactionQueue = new Promise<void>((resolve) => { release = resolve })
      await previous
      const working = cloneState(state)
      try {
        const result = await operation(createTransaction(working), fakeExecutor(working))
        state.tasks = working.tasks
        state.batches = working.batches
        state.items = working.items
        state.domainWrites = working.domainWrites
        return result
      }
      finally {
        release()
      }
    },
    async claimTasks(input: any) {
      const linkedToSealed = (taskId: string) => [...state.items.values()].some(item =>
        item.organizationId === input.organizationId
        && item.taskId === taskId
        && !!state.batches.get(item.batchId)?.sealedAt,
      )
      const exhausted = [...state.tasks.values()]
        .filter(task => task.organizationId === input.organizationId && input.types.includes(task.type))
        .filter(task => linkedToSealed(task.id))
        .filter(task => task.status === 'processing' && task.attemptCount >= task.maxAttempts)
        .filter(task => !!task.leaseExpiresAt && task.leaseExpiresAt <= input.now)
        .slice(0, input.limit)
      for (const task of exhausted) Object.assign(task, {
        status: 'failed', leaseExpiresAt: null, resultCode: 'lease_expired', completedAt: input.now,
      })
      const eligible = [...state.tasks.values()]
        .filter(task => task.organizationId === input.organizationId && input.types.includes(task.type))
        .filter(task => linkedToSealed(task.id))
        .filter(task => task.attemptCount < task.maxAttempts)
        .filter(task => (task.status === 'pending' && task.availableAt <= input.now)
          || (task.status === 'processing' && !!task.leaseExpiresAt && task.leaseExpiresAt <= input.now))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, input.limit)
      for (const task of eligible) Object.assign(task, {
        status: 'processing',
        attemptCount: task.attemptCount + 1,
        leaseExpiresAt: input.leaseExpiresAt,
        resultCode: null,
        updatedAt: input.now,
      })
      for (const task of [...exhausted, ...eligible]) {
        for (const batchId of await createTransaction(state).findBatchIdsForTask({
          organizationId: input.organizationId,
          taskId: task.id,
        })) await createTransaction(state).refreshBatchStatus({ organizationId: input.organizationId, batchId, now: input.now })
      }
      return eligible.map(task => ({ ...task }))
    },
  } as unknown as ProcessingQueueAdapter

  return { adapter, state }
}

describe('durable processing queue', () => {
  it('defines one tenant resource lock key shared by both document task types', () => {
    expect(queue.processingTaskResourceLockKey).toBeTypeOf('function')
    expect(queue.processingTaskResourceLockKey(
      'org-1', 'document_parse', 'document-1',
    )).toBe(queue.processingTaskResourceLockKey(
      'org-1', 'document_upload_reconciliation', 'document-1',
    ))
    expect(queue.processingTaskResourceLockKey(
      'org-1', 'application_analysis', 'application-1',
    )).not.toBe(queue.processingTaskResourceLockKey(
      'org-2', 'application_analysis', 'application-1',
    ))
  })

  it('provides a queue-first upload finalization transaction', () => {
    expect(queue.completePendingUploadReconciliationTaskWithDomainWrite).toBeTypeOf('function')
    expect(queue.completePendingUploadReconciliationTaskWithDomainWriteInTransaction)
      .toBeTypeOf('function')
  })

  it('locks upload work before the domain callback and completes a pending task atomically', async () => {
    const { adapter, state } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const { task } = await queue.enqueueProcessingTask({
      organizationId: 'org-1', type: 'document_upload_reconciliation',
      resourceId: 'document-1', now,
    }, adapter)
    const finalized = await queue.completePendingUploadReconciliationTaskWithDomainWrite({
      organizationId: 'org-1', taskId: task.id, documentId: 'document-1', now,
    }, async (executor, lockedTask) => {
      expect(lockedTask.id).toBe(task.id)
      await executor.execute(sql`select 1`)
      return 'document-updated'
    }, adapter)

    expect(finalized).toMatchObject({ outcome: 'completed', result: 'document-updated' })
    expect(state.tasks.get(task.id)).toMatchObject({ status: 'completed', resultCode: 'upload_completed' })
    expect(state.domainWrites).toEqual(['domain-write'])
  })

  it('lets a slow successful uploader write while reconciliation is processing', async () => {
    const { adapter, state } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const { task } = await queue.enqueueProcessingTask({
      organizationId: 'org-1', type: 'document_upload_reconciliation',
      resourceId: 'document-1', now,
    }, adapter)
    await queue.claimProcessingTasks({
      organizationId: 'org-1', types: ['document_upload_reconciliation'], now,
    }, adapter)
    const finalized = await queue.completePendingUploadReconciliationTaskWithDomainWrite({
      organizationId: 'org-1', taskId: task.id, documentId: 'document-1', now,
    }, async (executor) => {
      await executor.execute(sql`select 1`)
      return 'document-updated'
    }, adapter)

    expect(finalized).toMatchObject({ outcome: 'processing', result: 'document-updated' })
    expect(state.tasks.get(task.id)?.status).toBe('processing')
    expect(state.domainWrites).toEqual(['domain-write'])
  })

  it('does not run a domain write after upload work is already completed', async () => {
    const { adapter } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const { task } = await queue.enqueueProcessingTask({
      organizationId: 'org-1', type: 'document_upload_reconciliation',
      resourceId: 'document-1', now,
    }, adapter)
    await queue.completePendingUploadReconciliationTask({
      organizationId: 'org-1', taskId: task.id, documentId: 'document-1', now,
    }, adapter)
    let callbackRan = false
    const finalized = await queue.completePendingUploadReconciliationTaskWithDomainWrite({
      organizationId: 'org-1', taskId: task.id, documentId: 'document-1', now,
    }, async () => {
      callbackRan = true
      return 'unexpected-write'
    }, adapter)

    expect(finalized).toMatchObject({ outcome: 'completed', operationRan: false })
    expect(callbackRan).toBe(false)
  })

  it.each(['failed', 'cancelled'] as const)(
    'rejects %s upload work without running the domain callback',
    async (terminalStatus) => {
      const { adapter, state } = createQueueAdapter()
      const now = new Date('2026-07-16T12:00:00.000Z')
      const { task } = await queue.enqueueProcessingTask({
        organizationId: 'org-1', type: 'document_upload_reconciliation',
        resourceId: 'document-1', now,
      }, adapter)
      if (terminalStatus === 'cancelled') {
        await queue.cancelDocumentProcessingTasks({
          organizationId: 'org-1', documentIds: ['document-1'], now,
        }, adapter)
      }
      else {
        const [claimed] = await queue.claimProcessingTasks({
          organizationId: 'org-1', types: ['document_upload_reconciliation'], now,
        }, adapter)
        await queue.failProcessingTask({
          organizationId: 'org-1', taskId: claimed!.id,
          expectedAttemptCount: claimed!.attemptCount, resultCode: 'upload_missing',
          retryable: false, now,
        }, adapter)
      }
      let callbackRan = false
      await expect(queue.completePendingUploadReconciliationTaskWithDomainWrite({
        organizationId: 'org-1', taskId: task.id, documentId: 'document-1', now,
      }, async () => {
        callbackRan = true
      }, adapter)).rejects.toThrow('Upload reconciliation task is terminal')
      expect(callbackRan).toBe(false)
      expect(state.tasks.get(task.id)?.status).toBe(terminalStatus)
    },
  )

  it('links concurrent requests to one canonical active task without marking either batch successful', async () => {
    const { adapter, state } = createQueueAdapter()
    const input = {
      organizationId: 'org-1', type: 'document_parse' as const, resourceId: 'document-1',
      now: new Date('2026-07-16T12:00:00.000Z'),
    }
    const [first, second] = await Promise.all([
      queue.enqueueProcessingTask(input, adapter),
      queue.enqueueProcessingTask(input, adapter),
    ])
    expect(first.task.id).toBe(second.task.id)
    expect(state.tasks).toHaveLength(1)
    expect(state.batches).toHaveLength(2)
    expect(state.items).toHaveLength(2)
    expect([...state.batches.values()].every(batch => batch.status === 'pending')).toBe(true)
  })

  it('refreshes every linked batch when the canonical task succeeds', async () => {
    const { adapter, state } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const first = await queue.enqueueProcessingBatch({
      organizationId: 'org-1', type: 'document_parse', resourceIds: ['document-1'], now,
    }, adapter)
    const second = await queue.enqueueProcessingBatch({
      organizationId: 'org-1', type: 'document_parse', resourceIds: ['document-1'], now,
    }, adapter)
    expect(first.tasks[0]?.id).toBe(second.tasks[0]?.id)
    expect(first.batch.status).toBe('pending')
    expect(second.batch.status).toBe('pending')
    const [claimed] = await queue.claimProcessingTasks({
      organizationId: 'org-1', types: ['document_parse'], now,
    }, adapter)
    await queue.completeProcessingTask({
      organizationId: 'org-1', taskId: claimed!.id,
      expectedAttemptCount: claimed!.attemptCount, now,
    }, adapter)
    expect(state.batches.get(first.batch.id)?.status).toBe('completed')
    expect(state.batches.get(second.batch.id)?.status).toBe('completed')
  })

  it('refreshes every linked batch when a canonical task terminally fails', async () => {
    const { adapter, state } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const first = await queue.enqueueProcessingBatch({
      organizationId: 'org-1', type: 'document_parse', resourceIds: ['document-1'], now,
    }, adapter)
    const second = await queue.enqueueProcessingBatch({
      organizationId: 'org-1', type: 'document_parse', resourceIds: ['document-1'], now,
    }, adapter)
    const [claimed] = await queue.claimProcessingTasks({ organizationId: 'org-1', types: ['document_parse'], now }, adapter)
    await queue.failProcessingTask({
      organizationId: 'org-1', taskId: claimed!.id,
      expectedAttemptCount: claimed!.attemptCount, resultCode: 'parse_unsupported',
      retryable: false, now,
    }, adapter)
    expect(state.batches.get(first.batch.id)?.status).toBe('failed')
    expect(state.batches.get(second.batch.id)?.status).toBe('failed')
    expect(state.tasks.get(claimed!.id)?.resultCode).toBe('parse_unsupported')
  })

  it('deduplicates resources, seals atomically, and completes an empty batch truthfully', async () => {
    const { adapter, state } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const result = await queue.enqueueProcessingBatch({
      organizationId: 'org-1', type: 'document_parse',
      resourceIds: ['resource-z', 'resource-a', 'resource-z'], now,
    }, adapter)
    expect(result.items.map(item => item.resourceId)).toEqual(['resource-a', 'resource-z'])
    expect(result.tasks.map(task => task.resourceId)).toEqual(['resource-a', 'resource-z'])
    expect(result.batch).toMatchObject({ totalTasks: 2, status: 'pending', sealedAt: now })
    expect(state.items).toHaveLength(2)
    const empty = await queue.enqueueProcessingBatch({
      organizationId: 'org-1', type: 'document_parse', resourceIds: [], now,
    }, adapter)
    expect(empty.batch).toMatchObject({ totalTasks: 0, status: 'completed', completedAt: now })
  })

  it('rejects a bulk enqueue containing a missing resource before persisting queue state', async () => {
    const { adapter, state } = createQueueAdapter({ missingResourceIds: ['missing-document'] })
    await expect(queue.enqueueProcessingBatch({
      organizationId: 'org-1',
      type: 'document_parse',
      resourceIds: ['existing-document', 'missing-document'],
    }, adapter)).rejects.toMatchObject({
      name: 'ProcessingResourceNotFoundError',
      code: 'processing_resource_not_found',
      message: 'Processing resource was not found',
    })
    expect(state.batches).toHaveLength(0)
    expect(state.tasks).toHaveLength(0)
    expect(state.items).toHaveLength(0)

    const source = readProjectFile('server/utils/processingQueue.ts')
    const bulk = source.slice(
      source.indexOf('export async function enqueueProcessingBatch'),
      source.indexOf('export type ClaimProcessingTasksInput'),
    )
    expect(bulk.indexOf('await tx.prepareTaskResources'))
      .toBeLessThan(bulk.indexOf('await tx.createBatch'))
  })

  it('preserves task, item, and batch history when document work is cancelled', async () => {
    const { adapter, state } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const result = await queue.enqueueProcessingBatch({
      organizationId: 'org-1', type: 'document_parse', resourceIds: ['document-1'], now,
    }, adapter)
    await queue.cancelDocumentProcessingTasks({
      organizationId: 'org-1', documentIds: ['document-1'], now,
    }, adapter)
    expect(state.tasks).toHaveLength(1)
    expect(state.items).toHaveLength(1)
    expect(state.batches).toHaveLength(1)
    expect(state.tasks.values().next().value).toMatchObject({ status: 'cancelled', resultCode: 'resource_removed' })
    expect(state.batches.get(result.batch.id)).toMatchObject({ status: 'cancelled', cancelledTasks: 1 })
  })

  it('cancels application analysis through the generic tenant-scoped primitive', async () => {
    const { adapter, state } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const result = await queue.enqueueProcessingBatch({
      organizationId: 'org-1', type: 'application_analysis', resourceIds: ['application-1'], now,
    }, adapter)
    await queue.cancelProcessingTasks({
      organizationId: 'org-1',
      targets: [{ type: 'application_analysis', resourceId: 'application-1' }],
      resultCode: 'resource_removed',
      now,
    }, adapter)
    expect(state.tasks.get(result.tasks[0]!.id)).toMatchObject({
      status: 'cancelled',
      resultCode: 'resource_removed',
    })
    expect(state.batches.get(result.batch.id)).toMatchObject({ status: 'cancelled', cancelledTasks: 1 })
  })

  it('keeps an existing open-batch membership bound to its original canonical task', async () => {
    const { adapter, state } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const batch = await queue.createProcessingBatch({
      organizationId: 'org-1', type: 'document_parse', now,
    }, adapter)
    const first = await queue.enqueueProcessingTask({
      organizationId: 'org-1', type: 'document_parse', resourceId: 'document-1',
      batchId: batch.id, now,
    }, adapter)
    await queue.cancelDocumentProcessingTasks({
      organizationId: 'org-1', documentIds: ['document-1'], now,
    }, adapter)
    const repeated = await queue.enqueueProcessingTask({
      organizationId: 'org-1', type: 'document_parse', resourceId: 'document-1',
      batchId: batch.id, now,
    }, adapter)
    expect(repeated.task.id).toBe(first.task.id)
    expect(repeated.item.taskId).toBe(first.task.id)
    expect(state.tasks).toHaveLength(1)
    expect(state.items).toHaveLength(1)
  })

  it('fences completion, failure, heartbeat, and domain writes after cancellation', async () => {
    const { adapter, state } = createQueueAdapter()
    const start = new Date('2026-07-16T12:00:00.000Z')
    const { task } = await queue.enqueueProcessingTask({
      organizationId: 'org-1', type: 'document_parse', resourceId: 'document-1', now: start,
    }, adapter)
    const [claimed] = await queue.claimProcessingTasks({ organizationId: 'org-1', types: ['document_parse'], now: start }, adapter)
    await queue.cancelDocumentProcessingTasks({
      organizationId: 'org-1', documentIds: ['document-1'], now: start,
    }, adapter)
    const fenced = { organizationId: 'org-1', taskId: task.id, expectedAttemptCount: claimed!.attemptCount, now: start }
    await expect(queue.completeProcessingTask(fenced, adapter)).rejects.toThrow('Processing task lease is stale')
    await expect(queue.failProcessingTask({ ...fenced, resultCode: 'parse_failed' }, adapter)).rejects.toThrow('Processing task lease is stale')
    await expect(queue.renewProcessingTaskLease({ ...fenced, leaseMs: 10_000 }, adapter)).rejects.toThrow('Processing task lease is stale')
    let callbackRan = false
    await expect(queue.completeProcessingTaskWithDomainWrite(fenced, async () => {
      callbackRan = true
    }, adapter)).rejects.toThrow('Processing task lease is stale')
    expect(callbackRan).toBe(false)
    expect(state.domainWrites).toEqual([])
  })

  it('runs domain writes and completion atomically and rolls both back on callback failure', async () => {
    const { adapter, state } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const { task } = await queue.enqueueProcessingTask({
      organizationId: 'org-1', type: 'document_parse', resourceId: 'document-1', now,
    }, adapter)
    const [claimed] = await queue.claimProcessingTasks({ organizationId: 'org-1', types: ['document_parse'], now }, adapter)
    await expect(queue.completeProcessingTaskWithDomainWrite({
      organizationId: 'org-1', taskId: task.id, expectedAttemptCount: claimed!.attemptCount, now,
    }, async (executor) => {
      await executor.execute(sql`select 1`)
      throw new Error('domain write failed')
    }, adapter)).rejects.toThrow('domain write failed')
    expect(state.domainWrites).toEqual([])
    expect(state.tasks.get(task.id)?.status).toBe('processing')

    await queue.completeProcessingTaskWithDomainWrite({
      organizationId: 'org-1', taskId: task.id, expectedAttemptCount: claimed!.attemptCount, now,
    }, async (executor) => executor.execute(sql`select 1`), adapter)
    expect(state.domainWrites).toEqual(['domain-write'])
    expect(state.tasks.get(task.id)?.status).toBe('completed')
  })

  it('prevents attempt one from running a domain callback after attempt two reclaims the task', async () => {
    const { adapter, state } = createQueueAdapter()
    const start = new Date('2026-07-16T12:00:00.000Z')
    const { task } = await queue.enqueueProcessingTask({
      organizationId: 'org-1', type: 'document_parse', resourceId: 'document-1', now: start,
    }, adapter)
    await queue.claimProcessingTasks({ organizationId: 'org-1', types: ['document_parse'], now: start, leaseMs: 1_000 }, adapter)
    const [second] = await queue.claimProcessingTasks({
      organizationId: 'org-1', types: ['document_parse'], now: new Date('2026-07-16T12:00:02.000Z'), leaseMs: 1_000,
    }, adapter)
    let staleCallbackRan = false
    await expect(queue.completeProcessingTaskWithDomainWrite({
      organizationId: 'org-1', taskId: task.id, expectedAttemptCount: 1,
      now: new Date('2026-07-16T12:00:02.500Z'),
    }, async () => { staleCallbackRan = true }, adapter)).rejects.toThrow('Processing task lease is stale')
    expect(staleCallbackRan).toBe(false)
    expect(state.tasks.get(task.id)?.attemptCount).toBe(2)
    expect(second?.attemptCount).toBe(2)
  })

  it('renews only the current lease and bounds the heartbeat duration', async () => {
    const { adapter } = createQueueAdapter()
    const start = new Date('2026-07-16T12:00:00.000Z')
    const { task } = await queue.enqueueProcessingTask({
      organizationId: 'org-1', type: 'document_parse', resourceId: 'document-1', now: start,
    }, adapter)
    const [claimed] = await queue.claimProcessingTasks({ organizationId: 'org-1', types: ['document_parse'], now: start }, adapter)
    const renewed = await queue.renewProcessingTaskLease({
      organizationId: 'org-1', taskId: task.id, expectedAttemptCount: claimed!.attemptCount,
      leaseMs: 99 * 60 * 60 * 1_000, now: new Date('2026-07-16T12:01:00.000Z'),
    }, adapter)
    expect(renewed?.leaseExpiresAt?.toISOString()).toBe('2026-07-16T12:16:00.000Z')
  })

  it('uses retry codes without retaining raw errors and supports non-retryable terminal failure', async () => {
    const { adapter } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const { task } = await queue.enqueueProcessingTask({
      organizationId: 'org-1', type: 'document_parse', resourceId: 'document-1', now,
    }, adapter)
    const [claimed] = await queue.claimProcessingTasks({ organizationId: 'org-1', types: ['document_parse'], now }, adapter)
    const failed = await queue.failProcessingTask({
      organizationId: 'org-1', taskId: task.id, expectedAttemptCount: claimed!.attemptCount,
      resultCode: 'parse_unsupported', retryable: false, now,
    }, adapter)
    expect(failed).toMatchObject({ status: 'failed', resultCode: 'parse_unsupported' })
    expect(failed).not.toHaveProperty('lastError')
  })

  it('binds immediate upload completion and lets slow successful uploads win', async () => {
    const { adapter, state } = createQueueAdapter()
    const now = new Date('2026-07-16T12:00:00.000Z')
    const upload = await queue.enqueueProcessingTask({
      organizationId: 'org-1', type: 'document_upload_reconciliation', resourceId: 'document-1', now,
    }, adapter)
    await expect(queue.completePendingUploadReconciliationTask({
      organizationId: 'org-1', taskId: upload.task.id, documentId: 'wrong', now,
    }, adapter)).rejects.toThrow('does not match the document upload')
    await queue.claimProcessingTasks({ organizationId: 'org-1', types: ['document_upload_reconciliation'], now }, adapter)
    const result = await queue.completePendingUploadReconciliationTask({
      organizationId: 'org-1', taskId: upload.task.id, documentId: 'document-1', now,
    }, adapter)
    expect(result.outcome).toBe('processing')
    expect(state.tasks.get(upload.task.id)?.status).toBe('processing')
  })

  it('requires upload reconciliation to recheck pending state and reservation age', () => {
    const now = new Date('2026-07-16T12:30:00.000Z')
    expect(queue.isDocumentUploadReconciliationEligible({ uploadStatus: 'pending', createdAt: new Date('2026-07-16T12:00:00.000Z') }, now)).toBe(true)
    expect(queue.isDocumentUploadReconciliationEligible({ uploadStatus: 'pending', createdAt: new Date('2026-07-16T12:20:00.001Z') }, now)).toBe(false)
    expect(queue.isDocumentUploadReconciliationEligible({ uploadStatus: 'completed', createdAt: new Date('2026-07-16T12:00:00.000Z') }, now)).toBe(false)
  })

  it('defines tenant-scoped durable membership, cancellation history, and safe legacy parse work', () => {
    const schema = readProjectFile('server/database/schema/app.ts')
    const source = existsSync(join(process.cwd(), 'server/utils/processingQueue.ts')) ? readProjectFile('server/utils/processingQueue.ts') : ''
    const migration = readProjectFile('server/database/migrations/0054_processing_queue.sql')
    const journal = readProjectFile('server/database/migrations/meta/_journal.json')
    const candidateReservations = readProjectFile('server/utils/candidateDocumentReservation.ts')
    const publicRollback = readProjectFile('server/utils/rollbackPublicApplicationSubmission.ts')
    expect(schema).toContain("export const processingBatchItem = pgTable('processing_batch_item'")
    expect(schema).toContain("cancelledTasks: integer('cancelled_tasks').notNull().default(0)")
    expect(schema).toContain("resultCode: text('result_code')")
    expect(schema).not.toContain("skippedTasks: integer('skipped_tasks')")
    expect(schema).toContain("index('processing_task_runnable_idx')")
    expect(schema).toContain("index('processing_task_expired_lease_idx')")
    expect(source).toContain('FOR UPDATE SKIP LOCKED')
    expect(source).toContain('pg_advisory_xact_lock(hashtextextended')
    expect(source).toContain('class ProcessingResourceNotFoundError')
    expect(source).toContain('return [...new Set(rows.map(row => row.batchId))].sort()')
    const existingMembership = source.slice(
      source.indexOf('if (existingItem)'),
      source.indexOf('let task = await tx.findActiveTask'),
    )
    expect(existingMembership).toContain('tx.findTask')
    expect(existingMembership).not.toContain('tx.lockTask')
    expect(source).toContain('export async function cancelDocumentProcessingTasksInTransaction')
    expect(source).not.toContain('deleteDocumentProcessingTasksInTransaction')
    expect(candidateReservations).toContain('cancelDocumentProcessingTasksInTransaction')
    expect(publicRollback).toContain('cancelProcessingTasksInTransaction')
    expect(migration).toContain('CREATE TABLE "processing_batch_item"')
    expect(migration).toContain('UPDATE "document"\nSET "upload_status" = \'completed\';')
    expect(migration).toContain('migration-document-parse:')
    expect(migration).toContain("'document_parse'")
    expect(migration).not.toContain('migration-upload-reconciliation:')
    expect(migration).toContain('processing_task_runnable_idx')
    expect(migration).toContain('processing_task_expired_lease_idx')
    expect(journal).toContain('"tag": "0054_processing_queue"')
  })
})
