import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '../../server/database/schema'
import {
  claimDocumentErasures,
  completeDocumentErasure,
  enqueueDocumentErasure,
  recordDocumentErasureFailure,
  renewDocumentErasureLease,
} from '../../server/utils/documentErasureQueue'

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

describeWithPostgres('document erasure queue PostgreSQL behavior', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const databaseName = `careers_erasure_${suffix}`
  const admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined })
  let client: postgres.Sql
  let database: ReturnType<typeof drizzle<typeof schema>>

  beforeAll(async () => {
    await admin.unsafe(`create database "${databaseName}"`)
    client = postgres(databaseUrl(databaseName), { max: 10, onnotice: () => undefined })
    database = drizzle(client, { schema })
    await migrate(database, { migrationsFolder })
  }, 60_000)

  afterAll(async () => {
    await client?.end({ timeout: 5 })
    await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
    await admin.end({ timeout: 5 })
  })

  async function seedDocument(prefix: string) {
    const organizationId = `${prefix}_organization`
    const candidateId = `${prefix}_candidate`
    const documentId = `${prefix}_document`
    const storageKey = ['fixture', prefix, randomUUID()].join('/')
    await client`insert into "organization" ("id", "name", "slug")
      values (${organizationId}, 'Erasure Fixture', ${`${prefix}-slug`})`
    await client`insert into "candidate" (
      "id", "organization_id", "first_name", "last_name", "email"
    ) values (
      ${candidateId}, ${organizationId}, 'Fixture', 'Candidate', ${`${prefix}@example.invalid`}
    )`
    await client`insert into "document" (
      "id", "organization_id", "candidate_id", "storage_key", "original_filename", "mime_type"
    ) values (
      ${documentId}, ${organizationId}, ${candidateId}, ${storageKey}, 'fixture.pdf', 'application/pdf'
    )`
    return { organizationId, documentId, storageKey }
  }

  it('atomically inserts a tombstone when a document row is directly deleted', async () => {
    const seeded = await seedDocument(`direct_${suffix}`)

    await client`delete from "document" where "id" = ${seeded.documentId}`

    const [tombstone] = await client<{
      organizationId: string | null
      storageKey: string
      dedupeKey: string
      status: string
    }[]>`select
      "organization_id" as "organizationId",
      "storage_key" as "storageKey",
      "dedupe_key" as "dedupeKey",
      "status"
    from "document_erasure_queue" where "storage_key" = ${seeded.storageKey}`
    expect(tombstone).toEqual({
      organizationId: seeded.organizationId,
      storageKey: seeded.storageKey,
      dedupeKey: expect.stringMatching(/^document-erasure:[a-f0-9]{32}$/),
      status: 'pending',
    })
  })

  it('survives a Better Auth organization cascade with its ownership reference cleared', async () => {
    const seeded = await seedDocument(`cascade_${suffix}`)

    await client`delete from "organization" where "id" = ${seeded.organizationId}`

    const [tombstone] = await client<{
      organizationId: string | null
      storageKey: string
      status: string
    }[]>`select
      "organization_id" as "organizationId",
      "storage_key" as "storageKey",
      "status"
    from "document_erasure_queue" where "storage_key" = ${seeded.storageKey}`
    expect(tombstone).toEqual({
      organizationId: null,
      storageKey: seeded.storageKey,
      status: 'pending',
    })
  })

  it('enforces attempt and state constraints with server-role-only RLS', async () => {
    const constraints = await client<{ definition: string }[]>`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid = 'document_erasure_queue'::regclass
    `
    expect(constraints.map(row => row.definition).join('\n')).toContain('attempt_count')
    expect(constraints.map(row => row.definition).join('\n')).toContain('lease_expires_at')

    const [policy] = await client<{ qual: string, withCheck: string }[]>`
      select qual, with_check as "withCheck"
      from pg_policies
      where tablename = 'document_erasure_queue'
        and policyname = 'factory_careers_server_roles_full_access'
    `
    expect(policy?.qual).toContain('anon')
    expect(policy?.qual).toContain('authenticated')
    expect(policy?.withCheck).toContain('anon')
    expect(policy?.withCheck).toContain('authenticated')

    await expect(client`insert into "document_erasure_queue" (
      "id", "storage_key", "dedupe_key", "attempt_count", "max_attempts"
    ) values (
      ${`invalid_${suffix}`}, ${`invalid-${suffix}`}, ${`invalid-dedupe-${suffix}`}, 2, 1
    )`).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects mutation of immutable storage identity fields', async () => {
    const immutableId = `immutable_${suffix}`
    await client`insert into "document_erasure_queue" (
      "id", "storage_key", "dedupe_key"
    ) values (
      ${immutableId}, ${`fixture-${immutableId}`}, ${`dedupe-${immutableId}`}
    )`

    await expect(client`update "document_erasure_queue"
      set "storage_key" = ${`changed-${immutableId}`}
      where "id" = ${immutableId}`).rejects.toMatchObject({ code: '23514' })
  })

  it('preserves an explicit privacy association when the delete trigger dedupes', async () => {
    const seeded = await seedDocument(`privacy_${suffix}`)
    const privacyRequestId = `privacy_${suffix}_request`
    await client`insert into "privacy_request" (
      "id", "organization_id", "requester_name", "requester_email",
      "state_of_residence", "verification_token_hash"
    ) values (
      ${privacyRequestId}, ${seeded.organizationId}, 'Fixture Requester',
      ${`privacy-${suffix}@example.invalid`}, 'NY', ${`token-${suffix}`}
    )`

    await database.transaction(async (tx) => {
      await enqueueDocumentErasure(tx, {
        organizationId: seeded.organizationId,
        privacyRequestId,
        storageKey: seeded.storageKey,
        now: new Date('2026-08-23T12:00:00.000Z'),
      })
      await tx.delete(schema.document).where(eq(schema.document.id, seeded.documentId))
    })

    const rows = await client<{
      privacyRequestId: string | null
      dedupeKey: string
    }[]>`select
      "privacy_request_id" as "privacyRequestId",
      "dedupe_key" as "dedupeKey"
    from "document_erasure_queue" where "storage_key" = ${seeded.storageKey}`
    expect(rows).toEqual([{
      privacyRequestId,
      dedupeKey: expect.stringMatching(/^document-erasure:[a-f0-9]{32}$/),
    }])
  })

  it('claims distinct rows concurrently and fences stale completion and retry attempts', async () => {
    const now = new Date('2026-08-23T14:00:00.000Z')
    await client`update "document_erasure_queue" set
      "status" = 'completed', "lease_expires_at" = null,
      "completed_at" = ${now.toISOString()}, "updated_at" = ${now.toISOString()}
      where "status" = 'pending'`
    const ids = [`claim_${suffix}_a`, `claim_${suffix}_b`]
    for (const id of ids) {
      await client`insert into "document_erasure_queue" (
        "id", "storage_key", "dedupe_key", "available_at"
      ) values (${id}, ${`fixture-${id}`}, ${`dedupe-${id}`}, ${now.toISOString()})`
    }

    const [firstClaim, secondClaim] = await Promise.all([
      claimDocumentErasures(database, { now, limit: 1 }),
      claimDocumentErasures(database, { now, limit: 1 }),
    ])
    expect(firstClaim).toHaveLength(1)
    expect(secondClaim).toHaveLength(1)
    expect(new Set([firstClaim[0]!.id, secondClaim[0]!.id])).toEqual(new Set(ids))
    expect(firstClaim[0]!.attemptCount).toBe(1)
    expect(secondClaim[0]!.attemptCount).toBe(1)

    const staleId = firstClaim[0]!.id
    await client`update "document_erasure_queue"
      set "attempt_count" = 2, "lease_expires_at" = ${new Date(now.getTime() + 300_000).toISOString()}
      where "id" = ${staleId}`
    await expect(completeDocumentErasure(database, {
      id: staleId,
      attemptCount: 1,
      now,
      resultCode: 'deleted',
    })).resolves.toBe(false)
    await expect(recordDocumentErasureFailure(database, {
      id: staleId,
      attemptCount: 1,
      maxAttempts: 10,
      now,
      resultCode: 'ProviderTimeoutError',
    })).resolves.toBe(false)
    await expect(recordDocumentErasureFailure(database, {
      id: staleId,
      attemptCount: 2,
      maxAttempts: 1,
      now,
      resultCode: 'ProviderTimeoutError',
    })).resolves.toBe(false)
    await expect(renewDocumentErasureLease(database, {
      id: staleId,
      attemptCount: 1,
      now,
    })).resolves.toBe(false)
    await expect(renewDocumentErasureLease(database, {
      id: staleId,
      attemptCount: 2,
      now,
    })).resolves.toBe(true)

    const [state] = await client<{ status: string, attemptCount: number }[]>`
      select "status", "attempt_count" as "attemptCount"
      from "document_erasure_queue" where "id" = ${staleId}`
    expect(state).toEqual({ status: 'processing', attemptCount: 2 })
  })

  it('persists retry scheduling and terminal failure behind the current lease fence', async () => {
    const now = new Date('2026-08-23T15:00:00.000Z')
    await client`update "document_erasure_queue" set
      "status" = 'completed', "lease_expires_at" = null,
      "completed_at" = ${now.toISOString()}, "updated_at" = ${now.toISOString()}
      where "status" in ('pending', 'processing')`
    const retryId = `retry_${suffix}`
    await client`insert into "document_erasure_queue" (
      "id", "storage_key", "dedupe_key", "available_at", "max_attempts"
    ) values (${retryId}, ${`fixture-${retryId}`}, ${`dedupe-${retryId}`}, ${now.toISOString()}, 2)`
    const [first] = await claimDocumentErasures(database, { now, limit: 1 })
    expect(first?.id).toBe(retryId)
    await expect(recordDocumentErasureFailure(database, {
      id: retryId,
      attemptCount: 1,
      maxAttempts: 2,
      now,
      resultCode: 'ProviderTimeoutError',
    })).resolves.toBe(true)

    const [retry] = await client<{
      status: string
      availableAt: Date
      completedAt: Date | null
      resultCode: string
    }[]>`select "status", "available_at" as "availableAt",
      "completed_at" as "completedAt", "result_code" as "resultCode"
      from "document_erasure_queue" where "id" = ${retryId}`
    expect(retry).toMatchObject({
      status: 'pending',
      completedAt: null,
      resultCode: 'provider_timeout_error',
    })
    expect(new Date(retry!.availableAt).toISOString()).toBe('2026-08-23T15:01:00.000Z')

    const retryAt = new Date(retry!.availableAt)
    const [second] = await claimDocumentErasures(database, { now: retryAt, limit: 1 })
    expect(second).toMatchObject({ id: retryId, attemptCount: 2 })
    await expect(recordDocumentErasureFailure(database, {
      id: retryId,
      attemptCount: 2,
      maxAttempts: 2,
      now: retryAt,
      resultCode: 'ProviderTimeoutError',
    })).resolves.toBe(true)
    const [failed] = await client<{ status: string, completedAt: Date | null }[]>`
      select "status", "completed_at" as "completedAt"
      from "document_erasure_queue" where "id" = ${retryId}`
    expect(failed?.status).toBe('failed')
    expect(new Date(failed!.completedAt!).toISOString()).toBe(retryAt.toISOString())
  })
})
