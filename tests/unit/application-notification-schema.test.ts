import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('application notification persistence', () => {
  it('defines tenant-scoped subscription, event, delivery, and message records', () => {
    const schema = read('server/database/schema/app.ts')

    expect(schema).toContain("applicationNotificationCadenceEnum = pgEnum('application_notification_cadence'")
    expect(schema).toContain("applicationNotificationRecipientKindEnum = pgEnum('application_notification_recipient_kind'")
    expect(schema).toContain("applicationNotificationSubscription = pgTable('application_notification_subscription'")
    expect(schema).toContain("memberId: text('member_id').references(() => member.id, { onDelete: 'cascade' })")
    expect(schema).toContain("applicationNotificationEvent = pgTable('application_notification_event'")
    expect(schema).toContain("subscriptionSnapshot: jsonb('subscription_snapshot')")
    expect(schema).toContain("applicationNotificationDelivery = pgTable('application_notification_delivery'")
    expect(schema).toContain("applicationNotificationMessage = pgTable('application_notification_message'")
    expect(schema).toContain("uniqueIndex('application_notification_subscription_inbox_unique_idx')")
    expect(schema).toContain("uniqueIndex('application_notification_subscription_member_unique_idx')")
    expect(schema).toContain("uniqueIndex('application_notification_delivery_event_recipient_unique_idx')")
    expect(schema).toContain("uniqueIndex('application_notification_message_dedupe_key_idx')")
    expect(schema).toContain("index('application_notification_event_runnable_idx')")
    expect(schema).toContain("index('application_notification_delivery_due_idx')")
    expect(schema).toContain("check('application_notification_subscription_weekly_day_check'")
    expect(schema).toContain("check('application_notification_subscription_monthly_day_check'")
    expect(schema).toContain("index('application_notification_message_runnable_idx')")
  })

  it('migrates the queue without backfilling historical applications and protects every table with RLS', () => {
    const migration = read('server/database/migrations/0059_application_email_notifications.sql')
    const journal = read('server/database/migrations/meta/_journal.json')

    expect(migration).toContain('CREATE TABLE "application_notification_subscription"')
    expect(migration).toContain('CREATE TABLE "application_notification_event"')
    expect(migration).toContain('CREATE TABLE "application_notification_delivery"')
    expect(migration).toContain('CREATE TABLE "application_notification_message"')
    expect(migration).toContain('CREATE TRIGGER application_notification_application_inserted')
    expect(migration).toContain('AFTER INSERT ON "application"')
    expect(migration).toContain('"subscription_snapshot" jsonb')
    expect(migration).toContain("'cadence', subscription.cadence")
    expect(migration).toContain("'memberId', subscription.member_id")
    expect(migration).not.toMatch(/INSERT INTO "application_notification_event"[\s\S]+SELECT[\s\S]+FROM "application"/)
    expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(4)
    expect(migration.match(/factory_careers_server_roles_full_access/g)).toHaveLength(4)
    expect(migration).toContain('SET search_path = pg_catalog, public')
    for (const table of ['subscription', 'event', 'delivery', 'message']) {
      expect(migration).toContain(`ALTER TABLE "application_notification_${table}" ENABLE ROW LEVEL SECURITY`)
    }
    expect(journal).toContain('"tag": "0059_application_email_notifications"')
  })

  it('normalizes membership snapshot timestamps in a forward migration', () => {
    const originalMigration = read('server/database/migrations/0059_application_email_notifications.sql')
    const migration = read('server/database/migrations/0060_notification_membership_snapshot_utc.sql')
    const journal = JSON.parse(read('server/database/migrations/meta/_journal.json')) as {
      entries: Array<{ idx: number, tag: string }>
    }

    expect(originalMigration).toContain("'membershipCreatedAt', membership.created_at,")
    expect(originalMigration).not.toContain("membership.created_at AT TIME ZONE 'UTC'")
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.enqueue_application_notification_event()')
    expect(migration).toContain("'membershipCreatedAt', membership.created_at AT TIME ZONE 'UTC',")
    expect(migration).not.toContain('CREATE TRIGGER application_notification_application_inserted')
    expect(journal.entries.at(-1)).toEqual(expect.objectContaining({
      idx: 60,
      tag: '0060_notification_membership_snapshot_utc',
    }))
  })
})
