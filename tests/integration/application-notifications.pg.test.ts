import { randomUUID } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/database/schema'

const adminUrl = process.env.APPLICATION_NOTIFICATION_PG_TEST_URL
  ?? process.env.PROCESSING_QUEUE_PG_TEST_URL
  ?? process.env.SCORING_RUN_PG_TEST_URL
const postgresRequired = process.env.APPLICATION_NOTIFICATION_PG_REQUIRED === 'true'
if (postgresRequired && !adminUrl) {
  throw new Error(
    'APPLICATION_NOTIFICATION_PG_TEST_URL is required when APPLICATION_NOTIFICATION_PG_REQUIRED=true',
  )
}
const describeWithPostgres = adminUrl ? describe : describe.skip
const migrationsFolder = join(process.cwd(), 'server/database/migrations')

function migrationsThrough(index: number): string {
  const destination = mkdtempSync(join(tmpdir(), 'factory-careers-notification-migrations-'))
  cpSync(migrationsFolder, destination, { recursive: true })
  const journalPath = join(destination, 'meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ idx: number }> }
  journal.entries = journal.entries.filter(entry => entry.idx <= index)
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`)
  return destination
}

function databaseUrl(databaseName: string): string {
  const url = new URL(adminUrl!)
  url.pathname = `/${databaseName}`
  return url.toString()
}

describeWithPostgres('application notification PostgreSQL behavior', () => {
  it('does not backfill, enqueues every new application once, enforces recipient uniqueness, and hides internal rows from client roles', async () => {
    const admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const databaseName = `careers_notifications_${suffix}`
    const capturePath = join(tmpdir(), `factory-careers-notifications-${suffix}.jsonl`)
    // PostgreSQL 14 on developer Macs cannot execute the unrelated PostgreSQL
    // 15+ composite SET NULL migration at 0056. The notification migration only
    // depends on schema available through 0055, so apply 0059 directly below.
    const legacyMigrations = migrationsThrough(55)

    try {
      await admin.unsafe(`create database "${databaseName}"`)
      const client = postgres(databaseUrl(databaseName), { max: 4, onnotice: () => undefined })
      const database = drizzle(client, { schema })
      try {
        await migrate(database, { migrationsFolder: legacyMigrations })
        const organizationId = `notification_${suffix}_org`
        const jobId = `notification_${suffix}_job`
        await client`insert into "organization" ("id", "name", "slug") values (${organizationId}, 'Notifications', ${`notifications-${suffix}`})`
        await client`insert into "job" ("id", "organization_id", "title", "slug") values (${jobId}, ${organizationId}, 'Operator', ${`operator-${suffix}`})`
        await client`insert into "candidate" ("id", "organization_id", "first_name", "last_name", "email") values ('historical-candidate', ${organizationId}, 'Historical', 'Candidate', ${`historical-${suffix}@example.com`})`
        await client`insert into "application" ("id", "organization_id", "candidate_id", "job_id") values ('historical-application', ${organizationId}, 'historical-candidate', ${jobId})`

        const notificationMigration = readFileSync(
          join(migrationsFolder, '0059_application_email_notifications.sql'),
          'utf8',
        )
        for (const statement of notificationMigration.split('--> statement-breakpoint')) {
          if (statement.trim()) await client.unsafe(statement)
        }

        const [historical] = await client<{ count: number }[]>`select count(*)::int as count from "application_notification_event"`
        expect(historical?.count).toBe(0)

        await client`insert into "candidate" ("id", "organization_id", "first_name", "last_name", "email") values ('new-candidate', ${organizationId}, 'New', 'Candidate', ${`new-${suffix}@example.com`})`
        await client`insert into "application" ("id", "organization_id", "candidate_id", "job_id") values ('new-application', ${organizationId}, 'new-candidate', ${jobId})`

        const events = await client<{ applicationId: string, organizationId: string }[]>`
          select "application_id" as "applicationId", "organization_id" as "organizationId"
          from "application_notification_event"`
        expect(events).toEqual([{ applicationId: 'new-application', organizationId }])

        await client`insert into "application_notification_subscription" (
          "id", "organization_id", "recipient_kind", "cadence", "time_zone"
        ) values ('inbox-one', ${organizationId}, 'hiring_inbox', 'weekly', 'America/New_York')`
        const [defaultInbox] = await client<{
          cadence: string
          deliveryTime: string
          weeklyDay: number
          monthlyDay: number
        }[]>`select "cadence", "delivery_time" as "deliveryTime", "weekly_day" as "weeklyDay", "monthly_day" as "monthlyDay"
          from "application_notification_subscription" where "id" = 'inbox-one'`
        expect(defaultInbox).toEqual({ cadence: 'weekly', deliveryTime: '09:00', weeklyDay: 1, monthlyDay: 1 })
        await expect(client`insert into "application_notification_subscription" (
          "id", "organization_id", "recipient_kind", "cadence", "time_zone"
        ) values ('inbox-two', ${organizationId}, 'hiring_inbox', 'daily', 'UTC')`).rejects.toBeTruthy()

        const sharedEmail = `shared-${suffix}@example.com`
        await client`insert into "user" ("id", "name", "email", "email_verified")
          values ('notification-user', 'Notification User', ${sharedEmail}, true)`
        await client`insert into "member" ("id", "user_id", "organization_id", "role")
          values ('notification-member', 'notification-user', ${organizationId}, 'member')`
        await client`insert into "application_notification_subscription" (
          "id", "organization_id", "recipient_kind", "user_id", "member_id", "cadence", "time_zone"
        ) values ('member-one', ${organizationId}, 'member', 'notification-user', 'notification-member', 'immediate', 'America/New_York')`
        await client`insert into "candidate" ("id", "organization_id", "first_name", "last_name", "email")
          values ('second-candidate', ${organizationId}, 'Second', 'Candidate', ${`second-${suffix}@example.com`})`
        await client`insert into "application" ("id", "organization_id", "candidate_id", "job_id")
          values ('second-application', ${organizationId}, 'second-candidate', ${jobId})`

        const changedInboxEmail = `changed-${suffix}@example.com`
        await client`update "application_notification_subscription" set
          "recipient_email" = ${changedInboxEmail}, "cadence" = 'daily', "time_zone" = 'UTC', "updated_at" = now()
          where "id" = 'inbox-one'`

        Object.assign(process.env, {
          NODE_ENV: 'test',
          DATABASE_URL: databaseUrl(databaseName),
          BETTER_AUTH_SECRET: 'a'.repeat(32),
          BETTER_AUTH_URL: 'http://localhost:3000',
          S3_ENDPOINT: 'http://localhost:9000',
          S3_ACCESS_KEY: 'test',
          S3_SECRET_KEY: 'test',
          S3_BUCKET: 'test',
          FACTORY_CAREERS_HIRING_INBOX: sharedEmail,
          FACTORY_EMAIL_TEST_MODE: 'capture',
          FACTORY_EMAIL_CAPTURE_PATH: capturePath,
        })
        delete (globalThis as Record<string, unknown>).__env
        Object.assign(globalThis, { env: { DATABASE_URL: databaseUrl(databaseName) } })
        const { processApplicationNotificationCycle } = await import('../../server/utils/applicationNotificationQueue')
        await processApplicationNotificationCycle(new Date())

        const deliveries = await client<{ applicationId: string, recipientKey: string, status: string }[]>`
          select "application_id" as "applicationId", "recipient_key" as "recipientKey", "status"
          from "application_notification_delivery"
          order by "application_id", "recipient_key"`
        expect(deliveries).toEqual([
          { applicationId: 'new-application', recipientKey: 'hiring_inbox', status: 'pending' },
          { applicationId: 'second-application', recipientKey: 'hiring_inbox', status: 'pending' },
          { applicationId: 'second-application', recipientKey: 'member:notification-user', status: 'completed' },
        ])
        const messages = await client<{ cadence: string, recipientEmail: string, status: string }[]>`
          select "cadence", "recipient_email" as "recipientEmail", "status"
          from "application_notification_message" order by "cadence"`
        expect(messages).toEqual([
          { cadence: 'immediate', recipientEmail: sharedEmail, status: 'completed' },
          { cadence: 'weekly', recipientEmail: sharedEmail, status: 'pending' },
        ])
        expect(readFileSync(capturePath, 'utf8')).toContain(`New application: Second Candidate for Operator`)

        await client`update "application_notification_message" set "status" = 'completed', "completed_at" = now()
          where "cadence" = 'weekly'`
        await client`update "application_notification_delivery" set "status" = 'completed', "completed_at" = now()
          where "cadence" = 'weekly'`
        await client`delete from "member" where "id" = 'notification-member'`
        const [subscriptionsAfterRemoval] = await client<{ count: number }[]>`
          select count(*)::int as count from "application_notification_subscription"
          where "recipient_kind" = 'member' and "user_id" = 'notification-user'`
        expect(subscriptionsAfterRemoval?.count).toBe(0)
        await client`insert into "member" ("id", "user_id", "organization_id", "role")
          values ('notification-member-rejoined', 'notification-user', ${organizationId}, 'member')`

        await client`insert into "candidate" ("id", "organization_id", "first_name", "last_name", "email")
          values ('changed-config-candidate', ${organizationId}, 'Changed', 'Config', ${`changed-config-${suffix}@example.com`})`
        await client`insert into "application" ("id", "organization_id", "candidate_id", "job_id")
          values ('changed-config-application', ${organizationId}, 'changed-config-candidate', ${jobId})`

        await client`update "application_notification_subscription" set
          "recipient_email" = null, "cadence" = 'weekly', "time_zone" = 'America/New_York', "updated_at" = now()
          where "id" = 'inbox-one'`
        await client`insert into "candidate" ("id", "organization_id", "first_name", "last_name", "email")
          values ('late-candidate', ${organizationId}, 'Late', 'Candidate', ${`late-${suffix}@example.com`})`
        await client`insert into "application" ("id", "organization_id", "candidate_id", "job_id")
          values ('late-application', ${organizationId}, 'late-candidate', ${jobId})`
        await processApplicationNotificationCycle(new Date())

        const laterDeliveries = await client<{
          applicationId: string
          recipientKey: string
          recipientEmail: string
          status: string
        }[]>`select "application_id" as "applicationId", "recipient_key" as "recipientKey",
          "recipient_email" as "recipientEmail", "status"
          from "application_notification_delivery"
          where "application_id" in ('changed-config-application', 'late-application')
          order by "application_id", "recipient_key"`
        expect(laterDeliveries).toEqual([
          {
            applicationId: 'changed-config-application',
            recipientKey: 'hiring_inbox',
            recipientEmail: changedInboxEmail,
            status: 'pending',
          },
          {
            applicationId: 'late-application',
            recipientKey: 'hiring_inbox',
            recipientEmail: sharedEmail,
            status: 'completed',
          },
        ])
        const recoveryMessages = await client<{ count: number }[]>`
          select count(*)::int as count from "application_notification_message"
          where "dedupe_key" like '%:recovery:application-notification:late-application'
            and "status" = 'completed'`
        expect(recoveryMessages[0]?.count).toBe(1)
        expect(readFileSync(capturePath, 'utf8')).toContain('Late Candidate')

        await client.unsafe(`do $$ begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then
            create role anon;
          end if;
        end $$`)
        await client.unsafe('grant usage on schema public to anon')
        await client.unsafe('grant select on application_notification_event, application_notification_subscription, application_notification_delivery, application_notification_message to anon')
        const anonymous = await client.begin(async (tx) => {
          await tx.unsafe('set local role anon')
          return tx<{ tableName: string, count: number }[]>`
            select 'delivery' as "tableName", count(*)::int as count from "application_notification_delivery"
            union all select 'event', count(*)::int from "application_notification_event"
            union all select 'message', count(*)::int from "application_notification_message"
            union all select 'subscription', count(*)::int from "application_notification_subscription"
            order by "tableName"`
        })
        expect(anonymous).toEqual([
          { tableName: 'delivery', count: 0 },
          { tableName: 'event', count: 0 },
          { tableName: 'message', count: 0 },
          { tableName: 'subscription', count: 0 },
        ])
      }
      finally {
        await client.end()
      }
    }
    finally {
      rmSync(legacyMigrations, { recursive: true, force: true })
      rmSync(capturePath, { force: true })
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      await admin.end()
    }
  }, 120_000)
})
