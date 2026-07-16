import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'

const adminUrl = process.env.SCORING_RUN_PG_TEST_URL
const describeWithPostgres = adminUrl ? describe : describe.skip
const migrationsFolder = join(process.cwd(), 'server/database/migrations')

function databaseUrl(databaseName: string) {
  const url = new URL(adminUrl!)
  url.pathname = `/${databaseName}`
  return url.toString()
}

async function applyMigrations(url: string, folder = migrationsFolder) {
  const client = postgres(url, { max: 1, onnotice: () => undefined })
  try {
    await migrate(drizzle(client), { migrationsFolder: folder })
  }
  finally {
    await client.end()
  }
}

function migrationsThrough(index: number) {
  const destination = mkdtempSync(join(tmpdir(), 'factory-careers-migrations-'))
  cpSync(migrationsFolder, destination, { recursive: true })

  const journalPath = join(destination, 'meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ idx: number }>
  }
  journal.entries = journal.entries.filter(entry => entry.idx <= index)
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`)
  return destination
}

async function seedApplication(sql: postgres.Sql, prefix: string, organizationId: string) {
  const jobId = `${prefix}_job`
  const candidateId = `${prefix}_candidate`
  const applicationId = `${prefix}_application`

  await sql`insert into "job" ("id", "organization_id", "title", "slug")
    values (${jobId}, ${organizationId}, ${`${prefix} job`}, ${`${prefix}-job`})`
  await sql`insert into "candidate" ("id", "organization_id", "first_name", "last_name", "email")
    values (${candidateId}, ${organizationId}, 'Test', 'Candidate', ${`${prefix}@example.com`})`
  await sql`insert into "application" ("id", "organization_id", "candidate_id", "job_id", "score")
    values (${applicationId}, ${organizationId}, ${candidateId}, ${jobId}, 82)`

  return applicationId
}

async function insertRun(
  sql: postgres.Sql,
  id: string,
  organizationId: string,
  applicationId: string,
) {
  await sql`insert into "analysis_run" (
      "id", "organization_id", "application_id", "status", "provider", "model", "composite_score"
    ) values (${id}, ${organizationId}, ${applicationId}, 'completed', 'test', 'test-model', 82)`
}

async function expectForeignKeyViolation(operation: Promise<unknown>) {
  await expect(operation).rejects.toMatchObject({ code: '23503' })
}

async function verifyOwnershipAndDeleteBehavior(url: string, prefix: string) {
  const sql = postgres(url, { max: 1, onnotice: () => undefined })
  try {
    const orgA = `${prefix}_org_a`
    const orgB = `${prefix}_org_b`
    await sql`insert into "organization" ("id", "name", "slug") values
      (${orgA}, 'Organization A', ${`${prefix}-org-a`}),
      (${orgB}, 'Organization B', ${`${prefix}-org-b`})`

    const applicationA = await seedApplication(sql, `${prefix}_a`, orgA)
    const applicationOther = await seedApplication(sql, `${prefix}_other`, orgA)
    const applicationB = await seedApplication(sql, `${prefix}_b`, orgB)
    const correctRun = `${prefix}_correct_run`
    const wrongApplicationRun = `${prefix}_wrong_application_run`
    const crossTenantRun = `${prefix}_cross_tenant_run`
    await insertRun(sql, correctRun, orgA, applicationA)
    await insertRun(sql, wrongApplicationRun, orgA, applicationOther)
    await insertRun(sql, crossTenantRun, orgB, applicationB)

    await expectForeignKeyViolation(sql`
      update "application" set "current_analysis_run_id" = ${wrongApplicationRun}
      where "id" = ${applicationA}`)
    await expectForeignKeyViolation(sql`
      update "application" set "current_analysis_run_id" = ${crossTenantRun}
      where "id" = ${applicationA}`)

    await sql`update "application" set "current_analysis_run_id" = ${correctRun}
      where "id" = ${applicationA}`
    const [bound] = await sql<{ currentAnalysisRunId: string }[]>`
      select "current_analysis_run_id" as "currentAnalysisRunId" from "application"
      where "id" = ${applicationA}`
    expect(bound?.currentAnalysisRunId).toBe(correctRun)

    await sql`delete from "analysis_run" where "id" = ${correctRun}`
    const [unbound] = await sql<{ currentAnalysisRunId: string | null }[]>`
      select "current_analysis_run_id" as "currentAnalysisRunId" from "application"
      where "id" = ${applicationA}`
    expect(unbound?.currentAnalysisRunId).toBeNull()

    const deleteRun = `${prefix}_delete_run`
    await insertRun(sql, deleteRun, orgA, applicationA)
    await sql`update "application" set "current_analysis_run_id" = ${deleteRun}
      where "id" = ${applicationA}`
    await sql`delete from "application" where "id" = ${applicationA}`

    const [deletedApplication] = await sql<{ count: number }[]>`
      select count(*)::int as count from "application" where "id" = ${applicationA}`
    const [deletedRun] = await sql<{ count: number }[]>`
      select count(*)::int as count from "analysis_run" where "id" = ${deleteRun}`
    expect(deletedApplication?.count).toBe(0)
    expect(deletedRun?.count).toBe(0)
  }
  finally {
    await sql.end()
  }
}

async function verifyFeedbackLockSeesCommittedPointer(url: string, prefix: string) {
  const setup = postgres(url, { max: 1, onnotice: () => undefined })
  const scorer = postgres(url, { max: 1, onnotice: () => undefined })
  const reviewer = postgres(url, { max: 1, onnotice: () => undefined })
  let releaseScorer!: () => void
  let markScorerReady!: () => void
  const scorerRelease = new Promise<void>((resolve) => { releaseScorer = resolve })
  const scorerReady = new Promise<void>((resolve) => { markScorerReady = resolve })

  try {
    const organizationId = `${prefix}_feedback_org`
    const userId = `${prefix}_feedback_user`
    await setup`insert into "organization" ("id", "name", "slug")
      values (${organizationId}, 'Feedback Organization', ${`${prefix}-feedback-org`})`
    await setup`insert into "user" ("id", "name", "email")
      values (${userId}, 'Feedback User', ${`${prefix}-feedback@example.com`})`
    const applicationId = await seedApplication(setup, `${prefix}_feedback`, organizationId)
    const runA = `${prefix}_feedback_run_a`
    const runB = `${prefix}_feedback_run_b`
    await insertRun(setup, runA, organizationId, applicationId)
    await insertRun(setup, runB, organizationId, applicationId)
    await setup`update "application" set "current_analysis_run_id" = ${runA}
      where "id" = ${applicationId}`

    const scoringTransaction = scorer.begin(async (tx) => {
      await tx`update "application" set "current_analysis_run_id" = ${runB}
        where "id" = ${applicationId}`
      markScorerReady()
      await scorerRelease
    })
    await scorerReady

    let feedbackLockSettled = false
    const feedbackTransaction = reviewer.begin(async (tx) => {
      const [app] = await tx<{ currentAnalysisRunId: string | null }[]>`
        select "current_analysis_run_id" as "currentAnalysisRunId"
        from "application" where "id" = ${applicationId} for update`
      if (app?.currentAnalysisRunId !== runA) return 'stale'

      await tx`insert into "analysis_run_feedback" (
          "id", "organization_id", "analysis_run_id", "application_id", "sentiment", "created_by_id"
        ) values (
          ${`${prefix}_feedback`}, ${organizationId}, ${runA}, ${applicationId}, 'up', ${userId}
        )`
      return 'inserted'
    }).finally(() => { feedbackLockSettled = true })

    await new Promise(resolve => setTimeout(resolve, 50))
    expect(feedbackLockSettled).toBe(false)

    releaseScorer()
    await scoringTransaction
    expect(await feedbackTransaction).toBe('stale')

    const [feedbackCount] = await setup<{ count: number }[]>`
      select count(*)::int as count from "analysis_run_feedback"
      where "application_id" = ${applicationId}`
    expect(feedbackCount?.count).toBe(0)
  }
  finally {
    releaseScorer?.()
    await Promise.allSettled([setup.end(), scorer.end(), reviewer.end()])
  }
}

describeWithPostgres('application current analysis run PostgreSQL constraints', () => {
  it('enforces ownership, safe deletes, feedback locking, and fresh plus upgrade migrations', async () => {
    const admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const freshDatabase = `careers_score_fresh_${suffix}`
    const upgradeDatabase = `careers_score_upgrade_${suffix}`
    const partialMigrations = migrationsThrough(55)

    try {
      await admin.unsafe(`create database "${freshDatabase}"`)
      await admin.unsafe(`create database "${upgradeDatabase}"`)

      const freshUrl = databaseUrl(freshDatabase)
      await applyMigrations(freshUrl)
      await verifyOwnershipAndDeleteBehavior(freshUrl, `fresh_${suffix}`)
      await verifyFeedbackLockSeesCommittedPointer(freshUrl, `fresh_${suffix}`)

      const upgradeUrl = databaseUrl(upgradeDatabase)
      await applyMigrations(upgradeUrl, partialMigrations)
      const legacy = postgres(upgradeUrl, { max: 1, onnotice: () => undefined })
      const legacyOrg = `upgrade_${suffix}_org`
      const legacyRun = `upgrade_${suffix}_run`
      let legacyApplication = ''
      try {
        await legacy`insert into "organization" ("id", "name", "slug")
          values (${legacyOrg}, 'Upgrade Organization', ${`upgrade-${suffix}-org`})`
        legacyApplication = await seedApplication(legacy, `upgrade_${suffix}`, legacyOrg)
        await insertRun(legacy, legacyRun, legacyOrg, legacyApplication)
      }
      finally {
        await legacy.end()
      }

      await applyMigrations(upgradeUrl)
      const upgraded = postgres(upgradeUrl, { max: 1, onnotice: () => undefined })
      try {
        const [backfilled] = await upgraded<{ currentAnalysisRunId: string | null }[]>`
          select "current_analysis_run_id" as "currentAnalysisRunId" from "application"
          where "id" = ${legacyApplication}`
        expect(backfilled?.currentAnalysisRunId).toBe(legacyRun)
      }
      finally {
        await upgraded.end()
      }
      await verifyOwnershipAndDeleteBehavior(upgradeUrl, `upgraded_${suffix}`)
    }
    finally {
      rmSync(partialMigrations, { recursive: true, force: true })
      await admin.unsafe(`drop database if exists "${freshDatabase}" with (force)`)
      await admin.unsafe(`drop database if exists "${upgradeDatabase}" with (force)`)
      await admin.end()
    }
  }, 120_000)
})
