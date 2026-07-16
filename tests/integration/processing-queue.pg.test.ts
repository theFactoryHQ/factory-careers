import { randomUUID } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql as drizzleSql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/database/schema'
import {
  claimProcessingTasks,
  completeProcessingTaskWithResourceCleanup,
  createDrizzleProcessingQueueAdapter,
  enqueueProcessingBatch,
  findRunnableProcessingOrganizationIds,
  getProcessingBatchStatus,
} from '../../server/utils/processingQueue'

const adminUrl = process.env.PROCESSING_QUEUE_PG_TEST_URL ?? process.env.SCORING_RUN_PG_TEST_URL
const describeWithPostgres = adminUrl ? describe : describe.skip
const migrationsFolder = join(process.cwd(), 'server/database/migrations')

function queueMigrationsFolder() {
  const destination = mkdtempSync(join(tmpdir(), 'factory-careers-queue-migrations-'))
  cpSync(migrationsFolder, destination, { recursive: true })
  const journalPath = join(destination, 'meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ idx: number }>
  }
  journal.entries = journal.entries.filter(entry => entry.idx <= 55)
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`)
  return destination
}

function databaseUrl(databaseName: string) {
  const url = new URL(adminUrl!)
  url.pathname = `/${databaseName}`
  return url.toString()
}

async function seedApplications(sql: postgres.Sql, prefix: string, organizationId: string) {
  const jobId = `${prefix}_job`
  await sql`insert into "organization" ("id", "name", "slug")
    values (${organizationId}, 'Queue Organization', ${`${prefix}-organization`})`
  await sql`insert into "job" ("id", "organization_id", "title", "slug")
    values (${jobId}, ${organizationId}, 'Queue Job', ${`${prefix}-job`})`

  const applicationIds = [`${prefix}_application_a`, `${prefix}_application_b`, `${prefix}_application_c`]
  for (const [index, applicationId] of applicationIds.entries()) {
    const candidateId = `${prefix}_candidate_${index}`
    await sql`insert into "candidate" ("id", "organization_id", "first_name", "last_name", "email")
      values (${candidateId}, ${organizationId}, 'Queue', 'Candidate', ${`${prefix}-${index}@example.com`})`
    await sql`insert into "application" ("id", "organization_id", "candidate_id", "job_id")
      values (${applicationId}, ${organizationId}, ${candidateId}, ${jobId})`
  }
  return applicationIds
}

describeWithPostgres('durable processing queue PostgreSQL behavior', () => {
  it('discovers runnable tenants, claims one tenant batch with SKIP LOCKED, and sanitizes status', async () => {
    const admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const databaseName = `careers_queue_${suffix}`
    const queueMigrations = queueMigrationsFolder()

    try {
      await admin.unsafe(`create database "${databaseName}"`)
      const url = databaseUrl(databaseName)
      const client = postgres(url, { max: 10, onnotice: () => undefined })
      const database = drizzle(client, { schema })
      try {
        await migrate(database, { migrationsFolder: queueMigrations })
        const adapter = createDrizzleProcessingQueueAdapter(database)
        const organizationId = `queue_${suffix}_org`
        const [applicationA, applicationB, applicationC] = await seedApplications(
          client,
          `queue_${suffix}`,
          organizationId,
        )
        const now = new Date('2026-07-16T12:00:00.000Z')
        const target = await enqueueProcessingBatch({
          id: `queue_${suffix}_target`,
          organizationId,
          type: 'application_analysis',
          resourceIds: [applicationA!, applicationB!],
          now,
        }, adapter)
        const other = await enqueueProcessingBatch({
          id: `queue_${suffix}_other`,
          organizationId,
          type: 'application_analysis',
          resourceIds: [applicationC!],
          now,
        }, adapter)

        await expect(findRunnableProcessingOrganizationIds({
          types: ['application_analysis'], now,
        }, adapter)).resolves.toEqual([organizationId])

        const blocker = postgres(url, { max: 1, onnotice: () => undefined })
        let releaseTaskLock!: () => void
        let taskLockReady!: () => void
        const holdTaskLock = new Promise<void>((resolve) => { releaseTaskLock = resolve })
        const lockedTaskReady = new Promise<void>((resolve) => { taskLockReady = resolve })
        const blockedTaskId = target.tasks[0]!.id
        const blockingTransaction = blocker.begin(async (transaction) => {
          await transaction`select "id" from "processing_task"
            where "id" = ${blockedTaskId} for update`
          taskLockReady()
          await holdTaskLock
        })
        await lockedTaskReady

        let claimed: Awaited<ReturnType<typeof claimProcessingTasks>> = []
        try {
          const skippedLocked = await claimProcessingTasks({
            organizationId,
            batchId: target.batch.id,
            types: ['application_analysis'],
            limit: 1,
            leaseMs: 1_000,
            now,
          }, adapter)
          expect(skippedLocked).toHaveLength(1)
          expect(skippedLocked[0]!.id).not.toBe(blockedTaskId)
          releaseTaskLock()
          await blockingTransaction

          const formerlyLocked = await claimProcessingTasks({
            organizationId,
            batchId: target.batch.id,
            types: ['application_analysis'],
            limit: 1,
            leaseMs: 1_000,
            now,
          }, adapter)
          claimed = [...skippedLocked, ...formerlyLocked]
        }
        finally {
          releaseTaskLock()
          await Promise.allSettled([blockingTransaction, blocker.end()])
        }
        expect(new Set(claimed.map(task => task.id))).toHaveLength(2)
        expect(claimed.map(task => task.resourceId).sort()).toEqual([applicationA, applicationB].sort())

        const [otherTask] = await client<{ status: string }[]>`
          select "status" from "processing_task" where "id" = ${other.tasks[0]!.id}`
        expect(otherTask?.status).toBe('pending')
        await expect(getProcessingBatchStatus({
          organizationId: `wrong_${organizationId}`,
          batchId: target.batch.id,
        }, adapter)).resolves.toBeNull()

        await expect(findRunnableProcessingOrganizationIds({
          types: ['application_analysis'],
          now: new Date('2026-07-16T12:00:02.000Z'),
        }, adapter)).resolves.toEqual([organizationId])

        await client`update "processing_task"
          set "status" = 'failed', "result_code" = 'S3 access denied: private-object-key',
              "lease_expires_at" = null, "completed_at" = ${now.toISOString()}
          where "id" = ${claimed[0]!.id}`
        await client`update "processing_task"
          set "status" = 'completed', "result_code" = 'analysis_completed',
              "lease_expires_at" = null, "completed_at" = ${now.toISOString()}
          where "id" = ${claimed[1]!.id}`
        await client`update "processing_batch"
          set "status" = 'failed', "completed_tasks" = 1, "failed_tasks" = 1,
              "started_at" = ${now.toISOString()}, "completed_at" = ${now.toISOString()},
              "updated_at" = ${now.toISOString()}
          where "id" = ${target.batch.id} and "organization_id" = ${organizationId}`

        const status = await getProcessingBatchStatus({
          organizationId,
          batchId: target.batch.id,
        }, adapter)
        expect(status).toMatchObject({
          batchId: target.batch.id,
          type: 'application_analysis',
          status: 'failed',
          counts: { pending: 0, processing: 0, succeeded: 1, failed: 1, cancelled: 0, total: 2 },
          errorsByCode: { processing_failed: 1 },
        })
        expect(JSON.stringify(status)).not.toContain('private-object-key')
        expect(JSON.stringify(status)).not.toContain(applicationA)

        const documentId = `queue_${suffix}_document`
        await client`insert into "document" (
          "id", "organization_id", "candidate_id", "application_id", "type",
          "storage_key", "original_filename", "mime_type", "upload_status", "parse_status"
        ) select ${documentId}, ${organizationId}, "candidate_id", "id", 'resume',
          ${`queue/${suffix}/missing.pdf`}, 'missing.pdf', 'application/pdf', 'pending', 'pending'
          from "application" where "id" = ${applicationA}`
        const reconciliation = await enqueueProcessingBatch({
          id: `queue_${suffix}_reconciliation`,
          organizationId,
          type: 'document_upload_reconciliation',
          resourceIds: [documentId],
          now,
        }, adapter)
        const parse = await enqueueProcessingBatch({
          id: `queue_${suffix}_parse`,
          organizationId,
          type: 'document_parse',
          resourceIds: [documentId],
          now,
        }, adapter)
        await claimProcessingTasks({
          organizationId,
          batchId: reconciliation.batch.id,
          types: ['document_upload_reconciliation'],
          limit: 1,
          leaseMs: 1_000,
          now,
        }, adapter)
        const raceNow = new Date('2026-07-16T12:00:02.000Z')
        const [currentAttempt] = await claimProcessingTasks({
          organizationId,
          batchId: reconciliation.batch.id,
          types: ['document_upload_reconciliation'],
          limit: 1,
          leaseMs: 10_000,
          now: raceNow,
        }, adapter)
        expect(currentAttempt?.attemptCount).toBe(2)

        let staleDeleteRan = false
        const cleanupInput = {
          organizationId,
          taskId: reconciliation.tasks[0]!.id,
          resultCode: 'upload_missing',
          resourceTargets: [{ type: 'document_parse' as const, resourceId: documentId }],
          cancellationResultCode: 'resource_removed',
          now: raceNow,
        }
        const preparation = async () => ({
          cancellationTargets: [{ type: 'document_parse' as const, resourceId: documentId }],
          value: documentId,
        })
        const staleCleanup = completeProcessingTaskWithResourceCleanup({
          ...cleanupInput,
          expectedAttemptCount: 1,
        }, preparation, async () => {
          staleDeleteRan = true
        }, adapter)
        const currentCleanup = completeProcessingTaskWithResourceCleanup({
          ...cleanupInput,
          expectedAttemptCount: currentAttempt!.attemptCount,
        }, preparation, async (executor, _task, fencedDocumentId) => {
          await executor.execute(drizzleSql`
            delete from ${schema.document}
            where ${schema.document.id} = ${fencedDocumentId}
              and ${schema.document.organizationId} = ${organizationId}
          `)
        }, adapter)
        const [staleResult, currentResult] = await Promise.allSettled([
          staleCleanup,
          currentCleanup,
        ])
        expect(staleResult.status).toBe('rejected')
        expect(currentResult.status).toBe('fulfilled')
        expect(staleDeleteRan).toBe(false)

        const [remainingDocument] = await client<{ count: number }[]>`
          select count(*)::int as "count" from "document" where "id" = ${documentId}`
        expect(remainingDocument?.count).toBe(0)
        const taskStates = await client<{
          id: string
          type: string
          status: string
          resultCode: string | null
        }[]>`select "id", "type", "status", "result_code" as "resultCode"
          from "processing_task"
          where "organization_id" = ${organizationId} and "resource_id" = ${documentId}
          order by "id"`
        expect(taskStates).toEqual(expect.arrayContaining([
          expect.objectContaining({
            id: reconciliation.tasks[0]!.id,
            type: 'document_upload_reconciliation',
            status: 'completed',
            resultCode: 'upload_missing',
          }),
          expect.objectContaining({
            id: parse.tasks[0]!.id,
            type: 'document_parse',
            status: 'cancelled',
            resultCode: 'resource_removed',
          }),
        ]))
        expect(taskStates.filter(task =>
          task.status === 'pending' || task.status === 'processing',
        )).toEqual([])
      }
      finally {
        await client.end()
      }
    }
    finally {
      rmSync(queueMigrations, { recursive: true, force: true })
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      await admin.end()
    }
  }, 120_000)
})
