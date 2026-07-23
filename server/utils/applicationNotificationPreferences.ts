import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  applicationNotificationDelivery,
  applicationNotificationMessage,
  applicationNotificationSubscription,
  member,
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

export function normalizeHiringInboxRecipient(recipientEmail: string | null | undefined): {
  recipientEmail: string
  usesEnvironmentFallback: boolean
} {
  const normalized = recipientEmail?.trim().toLowerCase()
  return normalized
    ? { recipientEmail: normalized, usesEnvironmentFallback: false }
    : { recipientEmail: env.FACTORY_CAREERS_HIRING_INBOX, usesEnvironmentFallback: true }
}

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
    db.select({
      cadence: applicationNotificationSubscription.cadence,
      timeZone: applicationNotificationSubscription.timeZone,
      deliveryTime: applicationNotificationSubscription.deliveryTime,
      weeklyDay: applicationNotificationSubscription.weeklyDay,
      monthlyDay: applicationNotificationSubscription.monthlyDay,
    }).from(applicationNotificationSubscription)
      .innerJoin(member, eq(member.id, applicationNotificationSubscription.memberId))
      .where(and(
        eq(applicationNotificationSubscription.organizationId, input.organizationId),
        eq(applicationNotificationSubscription.recipientKind, 'member'),
        eq(applicationNotificationSubscription.userId, input.userId),
        eq(member.organizationId, input.organizationId),
        eq(member.userId, input.userId),
      )).limit(1).then(rows => rows[0]),
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
  const recipient = normalizeHiringInboxRecipient(subscription?.recipientEmail)

  return {
    ...preference,
    recipientEmail: recipient.recipientEmail,
    nextDeliveryAt: nextDeliveryAt(preference, input.now),
    usesEnvironmentFallback: recipient.usesEnvironmentFallback,
  }
}

async function cancelUnsentForRecipient(
  executor: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { organizationId: string, recipientKey: string, now: Date },
): Promise<void> {
  const cancelledMessages = await executor.update(applicationNotificationMessage)
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
      eq(applicationNotificationMessage.status, 'pending'),
    )).returning({ id: applicationNotificationMessage.id })

  if (cancelledMessages.length > 0) {
    await executor.update(applicationNotificationDelivery)
      .set({ status: 'cancelled', completedAt: input.now, updatedAt: input.now })
      .where(and(
        eq(applicationNotificationDelivery.organizationId, input.organizationId),
        eq(applicationNotificationDelivery.recipientKey, input.recipientKey),
        eq(applicationNotificationDelivery.status, 'pending'),
        inArray(applicationNotificationDelivery.messageId, cancelledMessages.map(row => row.id)),
      ))
  }
}

export async function savePersonalApplicationNotificationPreference(input: {
  organizationId: string
  userId: string
  preference: ApplicationNotificationPreference
  now?: Date
}): Promise<PersonalApplicationNotificationResponse> {
  const now = input.now ?? new Date()
  await db.transaction(async (tx) => {
    const [membership] = await tx.select({ id: member.id }).from(member).where(and(
      eq(member.organizationId, input.organizationId),
      eq(member.userId, input.userId),
    )).limit(1)
    if (!membership) throw new Error('active_membership_required')

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
      memberId: membership.id,
      recipientEmail: null,
      ...input.preference,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [applicationNotificationSubscription.organizationId, applicationNotificationSubscription.userId],
      targetWhere: sql`${applicationNotificationSubscription.recipientKind} = 'member'`,
      set: { ...input.preference, memberId: membership.id, recipientEmail: null, updatedAt: now },
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
  const normalizedRecipient = input.settings.recipientEmail?.trim().toLowerCase() || null
  const settings = { ...input.settings, recipientEmail: normalizedRecipient }
  await db.transaction(async (tx) => {
    await tx.insert(applicationNotificationSubscription).values({
      organizationId: input.organizationId,
      recipientKind: 'hiring_inbox',
      userId: null,
      memberId: null,
      ...settings,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: applicationNotificationSubscription.organizationId,
      targetWhere: sql`${applicationNotificationSubscription.recipientKind} = 'hiring_inbox'`,
      set: { ...settings, userId: null, memberId: null, updatedAt: now },
    })

    if (settings.cadence === 'off') {
      await cancelUnsentForRecipient(tx, {
        organizationId: input.organizationId,
        recipientKey: 'hiring_inbox',
        now,
      })
    }
  })

  const preference: ApplicationNotificationPreference = settings
  const recipient = normalizeHiringInboxRecipient(settings.recipientEmail)
  return {
    ...settings,
    recipientEmail: recipient.recipientEmail,
    nextDeliveryAt: nextDeliveryAt(preference, now),
    usesEnvironmentFallback: recipient.usesEnvironmentFallback,
  }
}
