import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/database/schema'

const adminUrl = process.env.CANDIDATE_WORKFLOW_EMAIL_PG_TEST_URL
  ?? process.env.APPLICATION_NOTIFICATION_PG_TEST_URL
  ?? process.env.PROCESSING_QUEUE_PG_TEST_URL
const postgresRequired = process.env.CANDIDATE_WORKFLOW_EMAIL_PG_REQUIRED === 'true'
if (postgresRequired && !adminUrl) {
  throw new Error(
    'CANDIDATE_WORKFLOW_EMAIL_PG_TEST_URL is required when CANDIDATE_WORKFLOW_EMAIL_PG_REQUIRED=true',
  )
}
const describeWithPostgres = adminUrl ? describe : describe.skip
const migrationsFolder = join(process.cwd(), 'server/database/migrations')

function databaseUrl(databaseName: string): string {
  const url = new URL(adminUrl!)
  url.pathname = `/${databaseName}`
  return url.toString()
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describeWithPostgres('candidate workflow email PostgreSQL behavior', () => {
  it('commits durable sends, dedupes, recovers leases, retries safely, and fences stale workers', async () => {
    const admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const databaseName = `careers_workflow_email_${suffix}`
    const captureDirectory = mkdtempSync(join(tmpdir(), 'factory-careers-workflow-email-'))
    const url = databaseUrl(databaseName)

    try {
      await admin.unsafe(`create database "${databaseName}"`)
      const client = postgres(url, { max: 8, onnotice: () => undefined })
      const database = drizzle(client, { schema })
      try {
        await migrate(database, { migrationsFolder })
        const organizationId = `workflow_${suffix}_org`
        const jobId = `workflow_${suffix}_job`
        await client`insert into "organization" ("id", "name", "slug")
          values (${organizationId}, 'Workflow Org', ${`workflow-${suffix}`})`
        await client`insert into "job" ("id", "organization_id", "title", "slug")
          values (${jobId}, ${organizationId}, 'Durability Engineer', ${`durability-${suffix}`})`
        await client`insert into "org_settings" (
          "id", "organization_id", "application_acknowledgement_delay_minutes",
          "send_application_rejection", "application_rejection_delay_minutes",
          "application_rejection_business_hours_only", "email_business_hours_timezone",
          "email_business_hours_start_hour", "email_business_hours_end_hour"
        ) values (
          ${`settings-${suffix}`}, ${organizationId}, 60,
          true, 120, true, 'America/New_York', 9, 17
        )`

        Object.assign(process.env, {
          NODE_ENV: 'test',
          DATABASE_URL: url,
          BETTER_AUTH_SECRET: 'a'.repeat(32),
          BETTER_AUTH_URL: 'http://localhost:3000',
          S3_ENDPOINT: 'http://localhost:9000',
          S3_ACCESS_KEY: 'test',
          S3_SECRET_KEY: 'test',
          S3_BUCKET: 'test',
          FACTORY_EMAIL_TEST_MODE: 'capture',
          FACTORY_EMAIL_CAPTURE_PATH: join(captureDirectory, 'emails.jsonl'),
        })
        delete (globalThis as Record<string, unknown>).__env
        Object.assign(globalThis, { env: { DATABASE_URL: url } })

        const {
          enqueueCandidateWorkflowEmail,
          prepareConfiguredCandidateWorkflowEmail,
          processCandidateWorkflowEmailCycle,
        } = await import('../../server/utils/candidateWorkflowEmailQueue')
        const { createPublicApplication } = await import('../../server/utils/createPublicApplication')
        const { db } = await import('../../server/utils/db')

        const friday = new Date('2026-07-24T20:00:00.000Z')
        const acknowledgement = await prepareConfiguredCandidateWorkflowEmail({
          purpose: 'application_acknowledgement',
          now: friday,
          data: {
            organizationId,
            candidateName: 'Durable Candidate',
            candidateFirstName: 'Durable',
            candidateLastName: 'Candidate',
            candidateEmail: `candidate-${suffix}@example.com`,
            jobTitle: 'Durability Engineer',
            organizationName: 'Workflow Org',
            applicationDate: 'July 24, 2026',
            applicationStatus: 'new',
          },
        })
        expect(acknowledgement?.availableAt.toISOString()).toBe('2026-07-24T21:00:00.000Z')

        const created = await createPublicApplication({
          organizationId,
          jobId,
          candidate: {
            firstName: 'Durable',
            lastName: 'Candidate',
            email: `candidate-${suffix}@example.com`,
            country: 'United States',
            state: 'NY',
          },
          responses: [],
          documents: [],
          maxDocumentsPerCandidate: 10,
          candidateWorkflowEmail: acknowledgement,
        })

        const [committed] = await client<{
          id: string
          availableAt: Date
          status: string
        }[]>`select "id", "available_at" as "availableAt", "status"
          from "candidate_workflow_email_queue"
          where "application_id" = ${created.applicationId}`
        expect(new Date(committed!.availableAt).toISOString())
          .toBe('2026-07-24T21:00:00.000Z')
        expect(committed?.status).toBe('pending')

        const beforeDueSend = vi.fn().mockResolvedValue(null)
        await processCandidateWorkflowEmailCycle(
          new Date('2026-07-24T20:59:59.000Z'),
          { sendWorkflow: beforeDueSend },
        )
        expect(beforeDueSend).not.toHaveBeenCalled()

        const firstWorkerSend = vi.fn().mockResolvedValue('provider-ack')
        await processCandidateWorkflowEmailCycle(
          new Date('2026-07-24T21:00:00.000Z'),
          { sendWorkflow: firstWorkerSend },
        )
        expect(firstWorkerSend).toHaveBeenCalledOnce()
        expect(firstWorkerSend.mock.calls[0]?.[0].idempotencyKey)
          .toBe(`candidate-workflow-email:${committed!.id}`)

        const duplicate = await enqueueCandidateWorkflowEmail(db, {
          prepared: acknowledgement!,
          organizationId,
          applicationId: created.applicationId,
          candidateId: created.candidateId,
          jobId,
          transitionAt: friday,
        })
        expect(duplicate).toBeNull()

        const rejection = await prepareConfiguredCandidateWorkflowEmail({
          purpose: 'application_rejection',
          now: friday,
          data: {
            organizationId,
            candidateName: 'Durable Candidate',
            candidateFirstName: 'Durable',
            candidateLastName: 'Candidate',
            candidateEmail: `candidate-${suffix}@example.com`,
            jobTitle: 'Durability Engineer',
            organizationName: 'Workflow Org',
            applicationDate: 'July 24, 2026',
            applicationStatus: 'rejected',
          },
        })
        expect(rejection?.availableAt.toISOString()).toBe('2026-07-27T13:00:00.000Z')

        const retryTransition = new Date('2026-07-24T22:00:00.000Z')
        const retryRow = await enqueueCandidateWorkflowEmail(db, {
          prepared: {
            ...rejection!,
            scheduledFor: retryTransition,
            availableAt: retryTransition,
          },
          organizationId,
          applicationId: created.applicationId,
          candidateId: created.candidateId,
          jobId,
          transitionAt: retryTransition,
        })
        expect(retryRow).not.toBeNull()

        const entries: Array<{ body: string, attributes: Record<string, unknown> }> = []
        const logger = {
          logError(body: string, attributes: Record<string, string | number | boolean>) {
            entries.push({ body, attributes })
          },
          logWarn(body: string, attributes: Record<string, string | number | boolean>) {
            entries.push({ body, attributes })
          },
        }
        const failingSend = vi.fn().mockImplementation(async () => {
          const error = new Error('raw-secret-candidate-address')
          error.name = 'ProviderTimeoutError'
          throw error
        })
        let retryNow = retryTransition
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          await processCandidateWorkflowEmailCycle(retryNow, {
            sendWorkflow: failingSend,
            logger,
          })
          const [state] = await client<{
            status: string
            attemptCount: number
            availableAt: Date
            resultCode: string
          }[]>`select "status", "attempt_count" as "attemptCount",
              "available_at" as "availableAt", "result_code" as "resultCode"
            from "candidate_workflow_email_queue" where "id" = ${retryRow!.id}`
          expect(state?.attemptCount).toBe(attempt)
          expect(state?.resultCode).toBe('provider_timeout_error')
          if (attempt < 5) {
            expect(state?.status).toBe('pending')
            retryNow = new Date(state!.availableAt)
          }
          else {
            expect(state?.status).toBe('failed')
          }
        }
        expect(JSON.stringify(entries)).not.toContain('raw-secret-candidate-address')
        expect(entries.map(entry => entry.body)).toEqual([
          'candidate_workflow_email.retry_scheduled',
          'candidate_workflow_email.retry_scheduled',
          'candidate_workflow_email.retry_scheduled',
          'candidate_workflow_email.retry_scheduled',
          'candidate_workflow_email.failed',
        ])

        const staleTransition = new Date('2026-07-24T23:00:00.000Z')
        const staleRow = await enqueueCandidateWorkflowEmail(db, {
          prepared: {
            ...rejection!,
            scheduledFor: staleTransition,
            availableAt: staleTransition,
          },
          organizationId,
          applicationId: created.applicationId,
          candidateId: created.candidateId,
          jobId,
          transitionAt: staleTransition,
        })
        await client`update "candidate_workflow_email_queue" set
          "status" = 'processing', "attempt_count" = 1,
          "lease_expires_at" = ${new Date(staleTransition.getTime() - 1).toISOString()}
          where "id" = ${staleRow!.id}`
        const staleSend = deferred()
        const staleStarted = deferred()
        const staleCycle = processCandidateWorkflowEmailCycle(staleTransition, {
          sendWorkflow: async () => {
            staleStarted.resolve()
            await staleSend.promise
            return 'stale-provider-id'
          },
        })
        await staleStarted.promise
        await client`update "candidate_workflow_email_queue" set
          "status" = 'processing', "attempt_count" = 3,
          "lease_expires_at" = ${new Date(staleTransition.getTime() + 120_000).toISOString()}
          where "id" = ${staleRow!.id}`
        staleSend.resolve()
        await staleCycle
        const [staleState] = await client<{
          status: string
          attemptCount: number
          providerMessageId: string | null
        }[]>`select "status", "attempt_count" as "attemptCount",
            "provider_message_id" as "providerMessageId"
          from "candidate_workflow_email_queue" where "id" = ${staleRow!.id}`
        expect(staleState).toEqual({
          status: 'processing',
          attemptCount: 3,
          providerMessageId: null,
        })
        await client`update "candidate_workflow_email_queue" set
          "status" = 'failed', "lease_expires_at" = null,
          "result_code" = 'test_cleanup', "completed_at" = now()
          where "id" = ${staleRow!.id}`

        const concurrentTransition = new Date('2026-07-25T00:00:00.000Z')
        const concurrentRow = await enqueueCandidateWorkflowEmail(db, {
          prepared: {
            ...rejection!,
            scheduledFor: concurrentTransition,
            availableAt: concurrentTransition,
          },
          organizationId,
          applicationId: created.applicationId,
          candidateId: created.candidateId,
          jobId,
          transitionAt: concurrentTransition,
        })
        const concurrentSend = deferred()
        const concurrentStarted = deferred()
        const sendCount = vi.fn()
        const sender = async () => {
          sendCount()
          concurrentStarted.resolve()
          await concurrentSend.promise
          return 'concurrent-provider-id'
        }
        const firstCycle = processCandidateWorkflowEmailCycle(concurrentTransition, {
          sendWorkflow: sender,
        })
        await concurrentStarted.promise
        const secondCycle = processCandidateWorkflowEmailCycle(concurrentTransition, {
          sendWorkflow: sender,
        })
        await secondCycle
        expect(sendCount).toHaveBeenCalledOnce()
        concurrentSend.resolve()
        await firstCycle
        const [concurrentState] = await client<{ status: string }[]>`
          select "status" from "candidate_workflow_email_queue"
          where "id" = ${concurrentRow!.id}`
        expect(concurrentState?.status).toBe('completed')

        await client.unsafe(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
              CREATE ROLE anon;
            END IF;
          END
          $$;
        `)
        await client.unsafe('grant select on "candidate_workflow_email_queue" to anon')
        const hiddenRows = await client.begin(async (transaction) => {
          await transaction.unsafe('set local role anon')
          return await transaction<{ count: number }[]>`
            select count(*)::int as count from "candidate_workflow_email_queue"`
        })
        const [hidden] = hiddenRows
        expect(hidden?.count).toBe(0)
      }
      finally {
        await client.end({ timeout: 5 })
      }
    }
    finally {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      await admin.end({ timeout: 5 })
      rmSync(captureDirectory, { recursive: true, force: true })
    }
  }, 60_000)
})
