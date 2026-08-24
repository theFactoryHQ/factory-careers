import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/database/schema'

const harness = vi.hoisted(() => ({ database: null as any }))
vi.mock('../../server/utils/db', () => ({
  db: new Proxy({}, {
    get(_target, property) {
      const value = harness.database[property]
      return typeof value === 'function' ? value.bind(harness.database) : value
    },
  }),
}))
vi.mock('../../server/utils/recordActivity', () => ({ recordActivity: async () => undefined }))

import { deleteDocumentRelationalRecordWithProcessingHistory } from '../../server/utils/documentDeletion'
import {
  deleteCandidatePersonalDataForPrivacyRequest,
  reconcilePrivacyRequestErasureCompletionInTransaction,
} from '../../server/utils/privacyRequests'

const adminUrl = process.env.FACTORY_CORE_PG_TEST_URL
const postgresRequired = process.env.FACTORY_CORE_PG_REQUIRED === 'true'
if (postgresRequired && !adminUrl) {
  throw new Error('FACTORY_CORE_PG_TEST_URL is required when FACTORY_CORE_PG_REQUIRED=true')
}
const describeWithPostgres = adminUrl ? describe : describe.skip
const migrationsFolder = join(process.cwd(), 'server/database/migrations')

function databaseUrl(databaseName: string): string {
  const url = new URL(adminUrl!)
  url.pathname = `/${databaseName}`
  return url.toString()
}

describeWithPostgres('document erasure producer adoption', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const databaseName = `careers_erasure_adoption_${suffix}`
  const admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined })
  let client: postgres.Sql

  beforeAll(async () => {
    await admin.unsafe(`create database "${databaseName}"`)
    client = postgres(databaseUrl(databaseName), { max: 10, onnotice: () => undefined })
    harness.database = drizzle(client, { schema })
    await migrate(harness.database, { migrationsFolder })
  }, 60_000)

  afterAll(async () => {
    await client?.end({ timeout: 5 })
    await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
    await admin.end({ timeout: 5 })
  })

  async function seedCandidate(prefix: string, withDocument: boolean) {
    const organizationId = `${prefix}_organization`
    const candidateId = `${prefix}_candidate`
    const actorId = `${prefix}_actor`
    const privacyRequestId = `${prefix}_privacy`
    const requesterEmail = `${prefix}@example.invalid`
    const documentId = `${prefix}_document`
    const storageKey = `fixture/${prefix}/${randomUUID()}`
    await client`insert into "user" ("id", "name", "email", "email_verified")
      values (${actorId}, 'Erasure Reviewer', ${`reviewer-${prefix}@example.invalid`}, true)`
    await client`insert into "organization" ("id", "name", "slug")
      values (${organizationId}, 'Erasure Fixture', ${`${prefix}-slug`})`
    await client`insert into "candidate" (
      "id", "organization_id", "first_name", "last_name", "email"
    ) values (${candidateId}, ${organizationId}, 'Fixture', 'Candidate', ${requesterEmail})`
    await client`insert into "privacy_request" (
      "id", "organization_id", "requester_name", "requester_email",
      "state_of_residence", "verification_token_hash", "verified_at", "status"
    ) values (
      ${privacyRequestId}, ${organizationId}, 'Fixture Requester', ${requesterEmail},
      'NY', ${`token-${prefix}`}, now(), 'verified'
    )`
    if (withDocument) {
      await client`insert into "document" (
        "id", "organization_id", "candidate_id", "storage_key", "original_filename", "mime_type"
      ) values (
        ${documentId}, ${organizationId}, ${candidateId}, ${storageKey}, 'fixture.pdf', 'application/pdf'
      )`
    }
    return { actorId, candidateId, documentId, organizationId, privacyRequestId, storageKey }
  }

  it('rolls back direct relational deletion when durable enqueue fails', async () => {
    const seeded = await seedCandidate(`direct_rollback_${suffix}`, true)
    await client.unsafe(`
      create function public.reject_test_erasure() returns trigger language plpgsql as $$
      begin raise exception 'test enqueue rejection'; end $$;
      create trigger reject_test_erasure before insert on document_erasure_queue
      for each row execute function public.reject_test_erasure();
    `)

    await expect(deleteDocumentRelationalRecordWithProcessingHistory({
      organizationId: seeded.organizationId,
      documentId: seeded.documentId,
    })).rejects.toThrow()

    const [document] = await client<{ id: string }[]>`select "id" from "document" where "id" = ${seeded.documentId}`
    const tombstones = await client`select "id" from "document_erasure_queue" where "storage_key" = ${seeded.storageKey}`
    expect(document?.id).toBe(seeded.documentId)
    expect(tombstones).toHaveLength(0)
    await client`drop trigger reject_test_erasure on document_erasure_queue`
    await client`drop function public.reject_test_erasure()`
  })

  it('does not enqueue or delete an absent or cross-tenant document', async () => {
    const seeded = await seedCandidate(`direct_scope_${suffix}`, true)

    await expect(deleteDocumentRelationalRecordWithProcessingHistory({
      organizationId: 'another-organization',
      documentId: seeded.documentId,
    })).resolves.toBeNull()

    const [document] = await client<{ id: string }[]>`select "id" from "document" where "id" = ${seeded.documentId}`
    const tombstones = await client`select "id" from "document_erasure_queue" where "storage_key" = ${seeded.storageKey}`
    expect(document?.id).toBe(seeded.documentId)
    expect(tombstones).toHaveLength(0)
  })

  it('completes a privacy request synchronously when the candidate has no documents', async () => {
    const seeded = await seedCandidate(`privacy_empty_${suffix}`, false)

    const result = await deleteCandidatePersonalDataForPrivacyRequest({
      organizationId: seeded.organizationId,
      candidateIds: [seeded.candidateId],
      actorId: seeded.actorId,
      privacyRequestId: seeded.privacyRequestId,
    })

    expect(result).toMatchObject({
      deletedCandidateIds: [seeded.candidateId],
      deletedDocumentCount: 0,
      erasureStatus: 'completed',
      request: { status: 'completed' },
    })
    expect(result.request?.completedAt).toBeTruthy()
  })

  it('keeps privacy fulfillment in review while its document tombstone is unfinished', async () => {
    const seeded = await seedCandidate(`privacy_pending_${suffix}`, true)

    const result = await deleteCandidatePersonalDataForPrivacyRequest({
      organizationId: seeded.organizationId,
      candidateIds: [seeded.candidateId],
      actorId: seeded.actorId,
      privacyRequestId: seeded.privacyRequestId,
    })

    expect(result).toMatchObject({
      deletedCandidateIds: [seeded.candidateId],
      deletedDocumentCount: 1,
      erasureStatus: 'pending',
      request: { status: 'in_review', completedAt: null, completedById: null },
    })
    const rows = await client<{ privacyRequestId: string | null }[]>`
      select "privacy_request_id" as "privacyRequestId"
      from "document_erasure_queue" where "storage_key" = ${seeded.storageKey}`
    expect(rows).toEqual([{ privacyRequestId: seeded.privacyRequestId }])

    const terminalAt = new Date('2026-08-23T18:00:00.000Z')
    await client`update "document_erasure_queue" set
      "status" = 'failed', "result_code" = 'storage_error',
      "completed_at" = ${terminalAt.toISOString()}, "updated_at" = ${terminalAt.toISOString()}
      where "storage_key" = ${seeded.storageKey}`
    const failedCompletion = await reconcilePrivacyRequestErasureCompletionInTransaction(harness.database, {
      privacyRequestId: seeded.privacyRequestId,
      completedById: seeded.actorId,
      now: terminalAt,
    })
    expect(failedCompletion).toMatchObject({ status: 'in_review', completedAt: null })

    await client`update "document_erasure_queue" set
      "status" = 'completed', "result_code" = 'erased', "updated_at" = ${terminalAt.toISOString()}
      where "storage_key" = ${seeded.storageKey}`
    const completed = await reconcilePrivacyRequestErasureCompletionInTransaction(harness.database, {
      privacyRequestId: seeded.privacyRequestId,
      completedById: seeded.actorId,
      now: terminalAt,
    })
    expect(completed).toMatchObject({ status: 'completed', completedById: seeded.actorId })
    expect(completed?.completedAt).toBeTruthy()
  })

  it('does not regress a concurrently completed zero-document request', async () => {
    const seeded = await seedCandidate(`privacy_concurrent_${suffix}`, false)
    const fulfill = () => deleteCandidatePersonalDataForPrivacyRequest({
      organizationId: seeded.organizationId,
      candidateIds: [seeded.candidateId],
      actorId: seeded.actorId,
      privacyRequestId: seeded.privacyRequestId,
    })

    const results = await Promise.allSettled([fulfill(), fulfill()])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const [request] = await client<{ status: string, completedAt: Date | null }[]>`
      select "status", "completed_at" as "completedAt"
      from "privacy_request" where "id" = ${seeded.privacyRequestId}`
    expect(request?.status).toBe('completed')
    expect(request?.completedAt).toBeTruthy()
  })

  it('completes after concurrent workers finish the last two tombstones', async () => {
    const seeded = await seedCandidate(`privacy_workers_${suffix}`, true)
    const secondStorageKey = `fixture/privacy-workers/${randomUUID()}`
    await client`insert into "document" (
      "id", "organization_id", "candidate_id", "storage_key", "original_filename", "mime_type"
    ) values (
      ${`${seeded.documentId}_second`}, ${seeded.organizationId}, ${seeded.candidateId},
      ${secondStorageKey}, 'fixture-second.pdf', 'application/pdf'
    )`
    await deleteCandidatePersonalDataForPrivacyRequest({
      organizationId: seeded.organizationId,
      candidateIds: [seeded.candidateId],
      actorId: seeded.actorId,
      privacyRequestId: seeded.privacyRequestId,
    })
    const tombstones = await client<{ id: string }[]>`
      select "id" from "document_erasure_queue"
      where "privacy_request_id" = ${seeded.privacyRequestId} order by "id"`
    expect(tombstones).toHaveLength(2)

    let updatedCount = 0
    let releaseUpdates!: () => void
    const bothUpdated = new Promise<void>((resolve) => { releaseUpdates = resolve })
    const complete = (id: string) => harness.database.transaction(async (tx: any) => {
      const now = new Date('2026-08-23T19:00:00.000Z')
      await tx.update(schema.documentErasureQueue).set({
        status: 'completed', resultCode: 'erased', completedAt: now, updatedAt: now,
      }).where(eq(schema.documentErasureQueue.id, id))
      updatedCount += 1
      if (updatedCount === 2) releaseUpdates()
      await bothUpdated
      return reconcilePrivacyRequestErasureCompletionInTransaction(tx, {
        privacyRequestId: seeded.privacyRequestId,
        completedById: seeded.actorId,
        now,
      })
    })

    await Promise.all(tombstones.map(row => complete(row.id)))
    const [request] = await client<{ status: string }[]>`
      select "status" from "privacy_request" where "id" = ${seeded.privacyRequestId}`
    expect(request?.status).toBe('completed')
  })
})
