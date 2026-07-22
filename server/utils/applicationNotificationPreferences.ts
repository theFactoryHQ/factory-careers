import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  applicationNotificationDelivery,
  applicationNotificationMessage,
  applicationNotificationSubscription,
  orgSettings,
} from '../database/schema'
import { db } from './db'
import { env } from './env'
import {
  calculateNextApplicationNotificationDelivery,
  DEFAULT_HIRING_INBOX_NOTIFICATION_PREFERENCE,
  DEFAULT_MEMBER_NOTIFICATION_PREFERENCE,
  type ApplicationNotificationPreference,
  type HiringInboxNotificationSettings,
} from '~~/shared/application-notifications'

const DEFAULT_TIME_ZONE = 'America/New_York'

export type PersonalApplicationNotificationResponse = ApplicationNotificationPreference & {
  nextDeliveryAt: string | null
}

export type HiringInboxApplicationNotificationResponse = HiringInboxNotificationSettings & {
  nextDeliveryAt: string | null
  usesEnvironmentFallback: boolean
}

function nextDeliveryAt(
  preference: ApplicationNotificationPreference,
  now = new Date(),
): string | null {
  if (preference.cadence === 'off' || preference.cadence === 'immediate') return null
  return calculateNextApplicationNotificationDelivery(preference, now)?.toISOString() ?? null
}

async function getOrganizationNotificationTimeZone(organizationId: string): Promise<string> {
  const settings = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.organizationId, organizationId),
    columns: { emailBusinessHoursTimezone: true },
  })
  return settings?.emailBusinessHoursTimezone ?? DEFAULT_TIME_ZONE
}

export async function getPersonalApplicationNotificationPreference(input: {
  organizationId: string
  userId: string
  now?: Date
}): Promise<PersonalApplicationNotificationResponse> {
  const [subscription, defaultTimeZone] = await Promise.all([
    db.query.applicationNotificationSubscription.findFirst({
      where: and(
        eq(applicationNotificationSubscription.organizationId, input.organizationId),
        eq(applicationNotificationSubscription.recipientKind, 'member'),
        eq(applicationNotificationSubscription.userId, input.userId),
      ),
    }),
    getOrganizationNotificationTimeZone(input.organizationId),
  ])

  const preference: ApplicationNotificationPreference = subscription
    ? {
        cadence: subscription.cadence,
        timeZone: subscription.timeZone,
        deliveryTime: subscription.deliveryTime,
        weeklyDay: subscription.weeklyDay,
        monthlyDay: subscription.monthlyDay,
      }
    : {
        ...DEFAULT_MEMBER_NOTIFICATION_PREFERENCE,
        timeZone: defaultTimeZone,
      }

  return { ...preference, nextDeliveryAt: nextDeliveryAt(preference, input.now) }
}

export async function getHiringInboxApplicationNotificationSettings(input: {
  organizationId: string
  now?: Date
}): Promise<HiringInboxApplicationNotificationResponse> {
  const [subscription, defaultTimeZone] = await Promise.all([
    db.query.applicationNotificationSubscription.findFirst({
      where: and(
        eq(applicationNotificationSubscription.organizationId, input.organizationId),
        eq(applicationNotificationSubscription.recipientKind, 'hiring_inbox'),
      ),
    }),
    getOrganizationNotificationTimeZone(input.organizationId),
  ])

  const preference: ApplicationNotificationPreference = subscription
    ? {
        cadence: subscription.cadence,
        timeZone: subscription.timeZone,
        deliveryTime: subscription.deliveryTime,
        weeklyDay: subscription.weeklyDay,
        monthlyDay: subscription.monthlyDay,
      }
    : {
        ...DEFAULT_HIRING_INBOX_NOTIFICATION_PREFERENCE,
        timeZone: defaultTimeZone,
      }
  const usesEnvironmentFallback = !subscription?.recipientEmail

  return {
    ...preference,
    recipientEmail: subscription?.recipientEmail ?? env.FACTORY_CAREERS_HIRING_INBOX,
    nextDeliveryAt: nextDeliveryAt(preference, input.now),
    usesEnvironmentFallback,
  }
}

async function cancelUnsentForRecipient(
  executor: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { organizationId: string, recipientKey: string, now: Date },
): Promise<void> {
  await executor.update(applicationNotificationDelivery)
    .set({ status: 'cancelled', completedAt: input.now, updatedAt: input.now })
    .where(and(
      eq(applicationNotificationDelivery.organizationId, input.organizationId),
      eq(applicationNotificationDelivery.recipientKey, input.recipientKey),
      inArray(applicationNotificationDelivery.status, ['pending', 'processing']),
    ))

  await executor.update(applicationNotificationMessage)
    .set({
      status: 'cancelled',
      leaseExpiresAt: null,
      resultCode: 'subscription_disabled',
      completedAt: input.now,
      updatedAt: input.now,
    })
    .where(and(
      eq(applicationNotificationMessage.organizationId, input.organizationId),
      eq(applicationNotificationMessage.recipientKey, input.recipientKey),
      inArray(applicationNotificationMessage.status, ['pending', 'processing']),
    ))
}

export async function savePersonalApplicationNotificationPreference(input: {
  organizationId: string
  userId: string
  preference: ApplicationNotificationPreference
  now?: Date
}): Promise<PersonalApplicationNotificationResponse> {
  const now = input.now ?? new Date()
  await db.transaction(async (tx) => {
    if (input.preference.cadence === 'off') {
      await tx.delete(applicationNotificationSubscription).where(and(
        eq(applicationNotificationSubscription.organizationId, input.organizationId),
        eq(applicationNotificationSubscription.recipientKind, 'member'),
        eq(applicationNotificationSubscription.userId, input.userId),
      ))
      await cancelUnsentForRecipient(tx, {
        organizationId: input.organizationId,
        recipientKey: `member:${input.userId}`,
        now,
      })
      return
    }

    await tx.insert(applicationNotificationSubscription).values({
      organizationId: input.organizationId,
      recipientKind: 'member',
      userId: input.userId,
      recipientEmail: null,
      ...input.preference,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [applicationNotificationSubscription.organizationId, applicationNotificationSubscription.userId],
      targetWhere: sql`${applicationNotificationSubscription.recipientKind} = 'member'`,
      set: { ...input.preference, recipientEmail: null, updatedAt: now },
    })
  })

  return {
    ...input.preference,
    nextDeliveryAt: nextDeliveryAt(input.preference, now),
  }
}

export async function saveHiringInboxApplicationNotificationSettings(input: {
  organizationId: string
  settings: HiringInboxNotificationSettings
  now?: Date
}): Promise<HiringInboxApplicationNotificationResponse> {
  const now = input.now ?? new Date()
  await db.transaction(async (tx) => {
    await tx.insert(applicationNotificationSubscription).values({
      organizationId: input.organizationId,
      recipientKind: 'hiring_inbox',
      userId: null,
      ...input.settings,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: applicationNotificationSubscription.organizationId,
      targetWhere: sql`${applicationNotificationSubscription.recipientKind} = 'hiring_inbox'`,
      set: { ...input.settings, userId: null, updatedAt: now },
    })

    if (input.settings.cadence === 'off') {
      await cancelUnsentForRecipient(tx, {
        organizationId: input.organizationId,
        recipientKey: 'hiring_inbox',
        now,
      })
    }
  })

  const preference: ApplicationNotificationPreference = input.settings
  return {
    ...input.settings,
    recipientEmail: input.settings.recipientEmail ?? env.FACTORY_CAREERS_HIRING_INBOX,
    nextDeliveryAt: nextDeliveryAt(preference, now),
    usesEnvironmentFallback: input.settings.recipientEmail === null,
  }
}
