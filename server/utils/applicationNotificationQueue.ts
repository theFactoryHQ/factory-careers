import { and, asc, eq, inArray, lte, ne, or, sql } from 'drizzle-orm'
import {
  application,
  applicationNotificationDelivery,
  applicationNotificationEvent,
  applicationNotificationMessage,
  applicationNotificationSubscription,
  candidate,
  job,
  member,
  organization,
  user,
} from '../database/schema'
import { db } from './db'
import { resolveFactoryCareersBaseUrl } from './baseUrl'
import { sendApplicationNotificationEmail } from './email'
import { env } from './env'
import { getHiringInboxApplicationNotificationSettings } from './applicationNotificationPreferences'
import {
  buildApplicationNotificationRecipientPlans,
  getApplicationNotificationFailureOutcome,
  getApplicationNotificationMessageDedupeKey,
} from '~~/shared/application-notification-delivery'
import type { ApplicationDigestGroup } from '../lib/email/templates'

const EVENT_CLAIM_LIMIT = 50
const MESSAGE_CLAIM_LIMIT = 20
const LEASE_MS = 2 * 60_000
const DETAIL_LIMIT = 100

type NotificationEvent = typeof applicationNotificationEvent.$inferSelect
type NotificationMessage = typeof applicationNotificationMessage.$inferSelect

function leaseExpiresAt(now: Date): Date {
  return new Date(now.getTime() + LEASE_MS)
}

async function claimEvents(now: Date): Promise<NotificationEvent[]> {
  return db.transaction(async (tx) => {
    await tx.update(applicationNotificationEvent).set({
      status: 'failed',
      leaseExpiresAt: null,
      resultCode: 'lease_expired',
      completedAt: now,
      updatedAt: now,
    }).where(and(
      eq(applicationNotificationEvent.status, 'processing'),
      lte(applicationNotificationEvent.leaseExpiresAt, now),
      sql`${applicationNotificationEvent.attemptCount} >= ${applicationNotificationEvent.maxAttempts}`,
    ))

    const claimable = await tx.select({ id: applicationNotificationEvent.id })
      .from(applicationNotificationEvent)
      .where(and(
        sql`${applicationNotificationEvent.attemptCount} < ${applicationNotificationEvent.maxAttempts}`,
        or(
          and(
            eq(applicationNotificationEvent.status, 'pending'),
            lte(applicationNotificationEvent.availableAt, now),
          ),
          and(
            eq(applicationNotificationEvent.status, 'processing'),
            lte(applicationNotificationEvent.leaseExpiresAt, now),
          ),
        ),
      ))
      .orderBy(asc(applicationNotificationEvent.availableAt), asc(applicationNotificationEvent.createdAt))
      .limit(EVENT_CLAIM_LIMIT)
      .for('update', { skipLocked: true })

    if (claimable.length === 0) return []
    return tx.update(applicationNotificationEvent).set({
      status: 'processing',
      attemptCount: sql`${applicationNotificationEvent.attemptCount} + 1`,
      leaseExpiresAt: leaseExpiresAt(now),
      resultCode: null,
      updatedAt: now,
    }).where(inArray(applicationNotificationEvent.id, claimable.map(row => row.id))).returning()
  })
}

async function failEvent(event: NotificationEvent, error: unknown, now: Date): Promise<void> {
  const outcome = getApplicationNotificationFailureOutcome({
    attemptCount: event.attemptCount,
    maxAttempts: event.maxAttempts,
    now,
    failureCode: error instanceof Error ? error.name : 'fanout_failed',
  })
  await db.update(applicationNotificationEvent).set({
    ...outcome,
    leaseExpiresAt: null,
    updatedAt: now,
  }).where(and(
    eq(applicationNotificationEvent.id, event.id),
    eq(applicationNotificationEvent.status, 'processing'),
    eq(applicationNotificationEvent.attemptCount, event.attemptCount),
  ))
}

async function fanOutEvent(event: NotificationEvent, now: Date): Promise<void> {
  const [applicationRow] = await db.select({ id: application.id })
    .from(application)
    .where(and(
      eq(application.id, event.applicationId),
      eq(application.organizationId, event.organizationId),
    ))
    .limit(1)

  if (!applicationRow) return

  const [inbox, memberRows] = await Promise.all([
    getHiringInboxApplicationNotificationSettings({
      organizationId: event.organizationId,
      now: event.createdAt,
    }),
    db.select({
      userId: applicationNotificationSubscription.userId,
      recipientEmail: user.email,
      membershipCreatedAt: member.createdAt,
      cadence: applicationNotificationSubscription.cadence,
      timeZone: applicationNotificationSubscription.timeZone,
      deliveryTime: applicationNotificationSubscription.deliveryTime,
      weeklyDay: applicationNotificationSubscription.weeklyDay,
      monthlyDay: applicationNotificationSubscription.monthlyDay,
    }).from(applicationNotificationSubscription)
      .innerJoin(applicationNotificationEvent, eq(applicationNotificationEvent.id, event.id))
      .innerJoin(member, and(
        eq(member.organizationId, applicationNotificationSubscription.organizationId),
        eq(member.userId, applicationNotificationSubscription.userId),
      ))
      .innerJoin(user, eq(user.id, applicationNotificationSubscription.userId))
      .where(and(
        eq(applicationNotificationSubscription.organizationId, event.organizationId),
        eq(applicationNotificationSubscription.recipientKind, 'member'),
        ne(applicationNotificationSubscription.cadence, 'off'),
        lte(applicationNotificationSubscription.createdAt, applicationNotificationEvent.createdAt),
        lte(member.createdAt, applicationNotificationEvent.createdAt),
      )),
  ])

  const plans = buildApplicationNotificationRecipientPlans({
    createdAt: event.createdAt,
    inbox: inbox.cadence === 'off' || !inbox.recipientEmail
      ? null
      : {
          recipientEmail: inbox.recipientEmail,
          cadence: inbox.cadence,
          timeZone: inbox.timeZone,
          deliveryTime: inbox.deliveryTime,
          weeklyDay: inbox.weeklyDay,
          monthlyDay: inbox.monthlyDay,
        },
    members: memberRows.flatMap(row => row.userId
      ? [{ ...row, userId: row.userId }]
      : []),
  })

  await db.transaction(async (tx) => {
    for (const plan of plans) {
      const dedupeKey = getApplicationNotificationMessageDedupeKey({
        organizationId: event.organizationId,
        eventId: event.id,
        recipientKey: plan.recipientKey,
        cadence: plan.cadence,
        scheduledFor: plan.scheduledFor,
      })
      const inserted = await tx.insert(applicationNotificationMessage).values({
        organizationId: event.organizationId,
        recipientKey: plan.recipientKey,
        recipientKind: plan.recipientKind,
        userId: plan.userId,
        recipientEmail: plan.recipientEmail,
        cadence: plan.cadence,
        timeZone: plan.timeZone,
        scheduledFor: plan.scheduledFor,
        dedupeKey,
        availableAt: plan.scheduledFor,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing({
        target: applicationNotificationMessage.dedupeKey,
      }).returning({ id: applicationNotificationMessage.id })

      const messageId = inserted[0]?.id ?? (await tx.select({ id: applicationNotificationMessage.id })
        .from(applicationNotificationMessage)
        .where(eq(applicationNotificationMessage.dedupeKey, dedupeKey))
        .limit(1))[0]?.id
      if (!messageId) throw new Error('notification_message_missing')

      await tx.insert(applicationNotificationDelivery).values({
        organizationId: event.organizationId,
        eventId: event.id,
        applicationId: event.applicationId,
        messageId,
        recipientKey: plan.recipientKey,
        recipientKind: plan.recipientKind,
        userId: plan.userId,
        recipientEmail: plan.recipientEmail,
        cadence: plan.cadence,
        scheduledFor: plan.scheduledFor,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing({
        target: [applicationNotificationDelivery.eventId, applicationNotificationDelivery.recipientKey],
      })
    }

    await tx.update(applicationNotificationEvent).set({
      status: 'completed',
      leaseExpiresAt: null,
      resultCode: 'fanout_completed',
      completedAt: now,
      updatedAt: now,
    }).where(and(
      eq(applicationNotificationEvent.id, event.id),
      eq(applicationNotificationEvent.status, 'processing'),
      eq(applicationNotificationEvent.attemptCount, event.attemptCount),
    ))
  })
}

async function claimMessages(now: Date): Promise<NotificationMessage[]> {
  return db.transaction(async (tx) => {
    const exhausted = await tx.update(applicationNotificationMessage).set({
      status: 'failed',
      leaseExpiresAt: null,
      resultCode: 'lease_expired',
      completedAt: now,
      updatedAt: now,
    }).where(and(
      eq(applicationNotificationMessage.status, 'processing'),
      lte(applicationNotificationMessage.leaseExpiresAt, now),
      sql`${applicationNotificationMessage.attemptCount} >= ${applicationNotificationMessage.maxAttempts}`,
    )).returning({ id: applicationNotificationMessage.id })

    if (exhausted.length > 0) {
      await tx.update(applicationNotificationDelivery).set({
        status: 'failed',
        completedAt: now,
        updatedAt: now,
      }).where(and(
        inArray(applicationNotificationDelivery.messageId, exhausted.map(row => row.id)),
        eq(applicationNotificationDelivery.status, 'pending'),
      ))
    }

    const claimable = await tx.select({ id: applicationNotificationMessage.id })
      .from(applicationNotificationMessage)
      .where(and(
        sql`${applicationNotificationMessage.attemptCount} < ${applicationNotificationMessage.maxAttempts}`,
        or(
          and(
            eq(applicationNotificationMessage.status, 'pending'),
            lte(applicationNotificationMessage.availableAt, now),
          ),
          and(
            eq(applicationNotificationMessage.status, 'processing'),
            lte(applicationNotificationMessage.leaseExpiresAt, now),
          ),
        ),
      ))
      .orderBy(asc(applicationNotificationMessage.availableAt), asc(applicationNotificationMessage.createdAt))
      .limit(MESSAGE_CLAIM_LIMIT)
      .for('update', { skipLocked: true })

    if (claimable.length === 0) return []
    return tx.update(applicationNotificationMessage).set({
      status: 'processing',
      attemptCount: sql`${applicationNotificationMessage.attemptCount} + 1`,
      leaseExpiresAt: leaseExpiresAt(now),
      resultCode: null,
      updatedAt: now,
    }).where(inArray(applicationNotificationMessage.id, claimable.map(row => row.id))).returning()
  })
}

async function cancelMessage(message: NotificationMessage, resultCode: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(applicationNotificationMessage).set({
      status: 'cancelled',
      leaseExpiresAt: null,
      resultCode,
      completedAt: now,
      updatedAt: now,
    }).where(and(
      eq(applicationNotificationMessage.id, message.id),
      eq(applicationNotificationMessage.status, 'processing'),
      eq(applicationNotificationMessage.attemptCount, message.attemptCount),
    ))
    await tx.update(applicationNotificationDelivery).set({
      status: 'cancelled',
      completedAt: now,
      updatedAt: now,
    }).where(and(
      eq(applicationNotificationDelivery.messageId, message.id),
      eq(applicationNotificationDelivery.status, 'pending'),
    ))
  })
}

async function subscriptionStillActive(message: NotificationMessage): Promise<boolean> {
  if (message.recipientKind === 'hiring_inbox') {
    const current = await db.query.applicationNotificationSubscription.findFirst({
      where: and(
        eq(applicationNotificationSubscription.organizationId, message.organizationId),
        eq(applicationNotificationSubscription.recipientKind, 'hiring_inbox'),
      ),
      columns: { cadence: true },
    })
    return current?.cadence !== 'off'
  }

  if (!message.userId) return false
  const active = await db.select({ id: member.id })
    .from(member)
    .innerJoin(applicationNotificationSubscription, and(
      eq(applicationNotificationSubscription.organizationId, member.organizationId),
      eq(applicationNotificationSubscription.userId, member.userId),
      eq(applicationNotificationSubscription.recipientKind, 'member'),
      ne(applicationNotificationSubscription.cadence, 'off'),
    ))
    .where(and(
      eq(member.organizationId, message.organizationId),
      eq(member.userId, message.userId),
    ))
    .limit(1)
  return active.length > 0
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

async function processMessage(message: NotificationMessage, now: Date): Promise<void> {
  if (message.cadence === 'off') {
    await cancelMessage(message, 'subscription_inactive', now)
    return
  }

  if (!await subscriptionStillActive(message)) {
    await cancelMessage(message, 'subscription_inactive', now)
    return
  }

  const [{ total = 0 } = { total: 0 }, rows, organizationRow] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` })
      .from(applicationNotificationDelivery)
      .innerJoin(application, and(
        eq(application.id, applicationNotificationDelivery.applicationId),
        eq(application.organizationId, message.organizationId),
      ))
      .where(and(
        eq(applicationNotificationDelivery.messageId, message.id),
        eq(applicationNotificationDelivery.status, 'pending'),
      )).then(result => result[0] ?? { total: 0 }),
    db.select({
      id: application.id,
      createdAt: application.createdAt,
      status: application.status,
      score: application.score,
      candidateFirstName: candidate.firstName,
      candidateLastName: candidate.lastName,
      candidateEmail: candidate.email,
      jobTitle: job.title,
    }).from(applicationNotificationDelivery)
      .innerJoin(application, and(
        eq(application.id, applicationNotificationDelivery.applicationId),
        eq(application.organizationId, message.organizationId),
      ))
      .innerJoin(candidate, and(
        eq(candidate.id, application.candidateId),
        eq(candidate.organizationId, message.organizationId),
      ))
      .innerJoin(job, and(
        eq(job.id, application.jobId),
        eq(job.organizationId, message.organizationId),
      ))
      .where(and(
        eq(applicationNotificationDelivery.messageId, message.id),
        eq(applicationNotificationDelivery.status, 'pending'),
      ))
      .orderBy(asc(application.createdAt), asc(application.id))
      .limit(DETAIL_LIMIT),
    db.select({ name: organization.name }).from(organization)
      .where(eq(organization.id, message.organizationId)).limit(1).then(result => result[0]),
  ])

  const totalApplications = Number(total)
  if (totalApplications === 0 || rows.length === 0) {
    await cancelMessage(message, 'empty_digest', now)
    return
  }

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: message.timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const baseUrl = resolveFactoryCareersBaseUrl()
  const grouped = new Map<string, ApplicationDigestGroup>()
  for (const row of rows) {
    const group = grouped.get(row.jobTitle) ?? { jobTitle: row.jobTitle, applications: [] }
    group.applications.push({
      candidateName: `${row.candidateFirstName} ${row.candidateLastName}`.trim() || row.candidateEmail,
      candidateEmail: row.candidateEmail,
      receivedAt: dateFormatter.format(row.createdAt),
      status: titleCase(row.status),
      score: row.score,
      dashboardUrl: `${baseUrl}/dashboard/applications/${row.id}`,
    })
    grouped.set(row.jobTitle, group)
  }

  try {
    const providerMessageId = await sendApplicationNotificationEmail({
      idempotencyKey: `application-notification-message:${message.id}`,
      recipientEmail: message.recipientEmail,
      cadence: message.cadence,
      organizationName: organizationRow?.name ?? env.FACTORY_ORG_NAME,
      totalApplications,
      overflowCount: Math.max(0, totalApplications - DETAIL_LIMIT),
      dashboardUrl: `${baseUrl}/dashboard/applications`,
      groups: [...grouped.values()],
    })

    await db.transaction(async (tx) => {
      await tx.update(applicationNotificationMessage).set({
        status: 'completed',
        leaseExpiresAt: null,
        providerMessageId,
        resultCode: 'sent',
        completedAt: now,
        updatedAt: now,
      }).where(and(
        eq(applicationNotificationMessage.id, message.id),
        eq(applicationNotificationMessage.status, 'processing'),
        eq(applicationNotificationMessage.attemptCount, message.attemptCount),
      ))
      await tx.update(applicationNotificationDelivery).set({
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      }).where(and(
        eq(applicationNotificationDelivery.messageId, message.id),
        eq(applicationNotificationDelivery.status, 'pending'),
      ))
    })
  }
  catch (error) {
    const outcome = getApplicationNotificationFailureOutcome({
      attemptCount: message.attemptCount,
      maxAttempts: message.maxAttempts,
      now,
      failureCode: error instanceof Error ? error.name : 'provider_failed',
    })
    await db.transaction(async (tx) => {
      await tx.update(applicationNotificationMessage).set({
        ...outcome,
        leaseExpiresAt: null,
        updatedAt: now,
      }).where(and(
        eq(applicationNotificationMessage.id, message.id),
        eq(applicationNotificationMessage.status, 'processing'),
        eq(applicationNotificationMessage.attemptCount, message.attemptCount),
      ))
      if (outcome.status === 'failed') {
        await tx.update(applicationNotificationDelivery).set({
          status: 'failed',
          completedAt: now,
          updatedAt: now,
        }).where(and(
          eq(applicationNotificationDelivery.messageId, message.id),
          eq(applicationNotificationDelivery.status, 'pending'),
        ))
      }
    })
  }
}

export async function processApplicationNotificationCycle(now = new Date()): Promise<void> {
  const events = await claimEvents(now)
  for (const event of events) {
    try {
      await fanOutEvent(event, now)
    }
    catch (error) {
      await failEvent(event, error, now)
    }
  }

  const messages = await claimMessages(now)
  for (const message of messages) {
    await processMessage(message, now)
  }
}
