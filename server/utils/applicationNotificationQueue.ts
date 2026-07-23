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
} from '../database/schema'
import { db } from './db'
import { resolveFactoryCareersBaseUrl } from './baseUrl'
import { sendApplicationNotificationEmail } from './email'
import { env } from './env'
import { normalizeHiringInboxRecipient } from './applicationNotificationPreferences'
import { logError, logWarn } from './logger'
import {
  buildApplicationNotificationRecipientPlans,
  getApplicationNotificationFailureOutcome,
  getApplicationNotificationMessageDedupeKey,
} from '~~/shared/application-notification-delivery'
import { DEFAULT_HIRING_INBOX_NOTIFICATION_PREFERENCE } from '~~/shared/application-notifications'
import type { ApplicationDigestGroup } from '../lib/email/templates'

const EVENT_CLAIM_LIMIT = 50
const MESSAGE_CLAIM_LIMIT = 20
const LEASE_MS = 2 * 60_000
const DETAIL_LIMIT = 100

type NotificationEvent = typeof applicationNotificationEvent.$inferSelect
type NotificationMessage = typeof applicationNotificationMessage.$inferSelect
type ApplicationNotificationSender = typeof sendApplicationNotificationEmail

export type ApplicationNotificationQueueLogger = {
  logError(body: string, attributes: Record<string, string | number | boolean>): void
  logWarn(body: string, attributes: Record<string, string | number | boolean>): void
}

type ApplicationNotificationFailureTransition = {
  organizationId: string
  queueKind: 'event' | 'message'
  recordId: string
  attemptCount: number
  maxAttempts: number
  resultCode: string
  retryable: boolean
  cadence?: NotificationMessage['cadence']
  recipientKind?: NotificationMessage['recipientKind']
}

type NotificationClaimBatch<T> = {
  claimed: T[]
  exhausted: ApplicationNotificationFailureTransition[]
}

const defaultQueueLogger: ApplicationNotificationQueueLogger = {
  logError,
  logWarn,
}

function safeNotificationResultCode(value: string): string {
  return /^[a-z0-9_]{1,80}$/.test(value)
    ? value
    : 'notification_delivery_failed'
}

export function emitApplicationNotificationFailureTelemetry(
  transition: ApplicationNotificationFailureTransition | null,
  logger: ApplicationNotificationQueueLogger,
): void {
  if (!transition) return

  const attributes: Record<string, string | number | boolean> = {
    org_id: transition.organizationId,
    queue_kind: transition.queueKind,
    record_id: transition.recordId,
    attempt_count: transition.attemptCount,
    max_attempts: transition.maxAttempts,
    result_code: safeNotificationResultCode(transition.resultCode),
    retryable: transition.retryable,
  }
  if (transition.cadence) attributes.cadence = transition.cadence
  if (transition.recipientKind) attributes.recipient_kind = transition.recipientKind

  const eventName = transition.retryable
    ? `application_notification.${transition.queueKind}_retry_scheduled`
    : `application_notification.${transition.queueKind}_failed`
  if (transition.retryable) {
    logger.logWarn(eventName, attributes)
  }
  else {
    logger.logError(eventName, attributes)
  }
}

function leaseExpiresAt(now: Date): Date {
  return new Date(now.getTime() + LEASE_MS)
}

async function claimEvents(now: Date): Promise<NotificationClaimBatch<NotificationEvent>> {
  return db.transaction(async (tx) => {
    const exhausted = await tx.update(applicationNotificationEvent).set({
      status: 'failed',
      leaseExpiresAt: null,
      resultCode: 'lease_expired',
      completedAt: now,
      updatedAt: now,
    }).where(and(
      eq(applicationNotificationEvent.status, 'processing'),
      lte(applicationNotificationEvent.leaseExpiresAt, now),
      sql`${applicationNotificationEvent.attemptCount} >= ${applicationNotificationEvent.maxAttempts}`,
    )).returning({
      id: applicationNotificationEvent.id,
      organizationId: applicationNotificationEvent.organizationId,
      attemptCount: applicationNotificationEvent.attemptCount,
      maxAttempts: applicationNotificationEvent.maxAttempts,
    })

    const exhaustedTransitions = exhausted.map(row => ({
      organizationId: row.organizationId,
      queueKind: 'event' as const,
      recordId: row.id,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      resultCode: 'lease_expired',
      retryable: false,
    }))

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

    if (claimable.length === 0) {
      return { claimed: [], exhausted: exhaustedTransitions }
    }
    const claimed = await tx.update(applicationNotificationEvent).set({
      status: 'processing',
      attemptCount: sql`${applicationNotificationEvent.attemptCount} + 1`,
      leaseExpiresAt: leaseExpiresAt(now),
      resultCode: null,
      updatedAt: now,
    }).where(inArray(applicationNotificationEvent.id, claimable.map(row => row.id))).returning()
    return { claimed, exhausted: exhaustedTransitions }
  })
}

async function failEvent(
  event: NotificationEvent,
  error: unknown,
  now: Date,
): Promise<ApplicationNotificationFailureTransition | null> {
  const outcome = getApplicationNotificationFailureOutcome({
    attemptCount: event.attemptCount,
    maxAttempts: event.maxAttempts,
    now,
    failureCode: error instanceof Error ? error.name : 'fanout_failed',
  })
  const transitioned = await db.update(applicationNotificationEvent).set({
    ...outcome,
    leaseExpiresAt: null,
    updatedAt: now,
  }).where(and(
    eq(applicationNotificationEvent.id, event.id),
    eq(applicationNotificationEvent.status, 'processing'),
    eq(applicationNotificationEvent.attemptCount, event.attemptCount),
  )).returning({
    id: applicationNotificationEvent.id,
    organizationId: applicationNotificationEvent.organizationId,
    attemptCount: applicationNotificationEvent.attemptCount,
    maxAttempts: applicationNotificationEvent.maxAttempts,
  })
  const owned = transitioned[0]
  if (!owned) return null
  return {
    organizationId: owned.organizationId,
    queueKind: 'event',
    recordId: owned.id,
    attemptCount: owned.attemptCount,
    maxAttempts: owned.maxAttempts,
    resultCode: outcome.resultCode,
    retryable: outcome.status === 'pending',
  }
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

  const snapshot = event.subscriptionSnapshot
  const inboxSnapshot = snapshot.inbox ?? {
    ...DEFAULT_HIRING_INBOX_NOTIFICATION_PREFERENCE,
    recipientEmail: null,
    timeZone: snapshot.defaultTimeZone,
  }
  const inboxRecipient = normalizeHiringInboxRecipient(inboxSnapshot.recipientEmail)

  const plans = buildApplicationNotificationRecipientPlans({
    createdAt: event.createdAt,
    inbox: inboxSnapshot.cadence === 'off' || !inboxRecipient.recipientEmail
      ? null
      : {
          recipientEmail: inboxRecipient.recipientEmail,
          cadence: inboxSnapshot.cadence,
          timeZone: inboxSnapshot.timeZone,
          deliveryTime: inboxSnapshot.deliveryTime,
          weeklyDay: inboxSnapshot.weeklyDay,
          monthlyDay: inboxSnapshot.monthlyDay,
        },
    members: snapshot.members.map(row => ({
      ...row,
      membershipCreatedAt: new Date(row.membershipCreatedAt),
    })),
  })

  await db.transaction(async (tx) => {
    const activeLease = await tx.select({ id: applicationNotificationEvent.id })
      .from(applicationNotificationEvent)
      .where(and(
        eq(applicationNotificationEvent.id, event.id),
        eq(applicationNotificationEvent.status, 'processing'),
        eq(applicationNotificationEvent.attemptCount, event.attemptCount),
      ))
      .limit(1)
      .for('update')
    if (activeLease.length === 0) return

    for (const plan of plans) {
      const existingDelivery = await tx.select({ id: applicationNotificationDelivery.id })
        .from(applicationNotificationDelivery)
        .where(and(
          eq(applicationNotificationDelivery.eventId, event.id),
          eq(applicationNotificationDelivery.recipientKey, plan.recipientKey),
        )).limit(1)
      if (existingDelivery.length > 0) continue

      const dedupeKey = getApplicationNotificationMessageDedupeKey({
        organizationId: event.organizationId,
        eventId: event.id,
        recipientKey: plan.recipientKey,
        cadence: plan.cadence,
        configurationKey: plan.configurationKey,
        scheduledFor: plan.scheduledFor,
      })
      const messageValues = {
        organizationId: event.organizationId,
        recipientKey: plan.recipientKey,
        recipientKind: plan.recipientKind,
        userId: plan.userId,
        memberId: plan.memberId,
        recipientEmail: plan.recipientEmail,
        cadence: plan.cadence,
        timeZone: plan.timeZone,
        configurationKey: plan.configurationKey,
        scheduledFor: plan.scheduledFor,
        availableAt: plan.scheduledFor,
        createdAt: now,
        updatedAt: now,
      }
      const inserted = await tx.insert(applicationNotificationMessage).values({
        ...messageValues,
        dedupeKey,
      }).onConflictDoNothing({
        target: applicationNotificationMessage.dedupeKey,
      }).returning({ id: applicationNotificationMessage.id, status: applicationNotificationMessage.status })

      let message = inserted[0] ?? (await tx.select({
        id: applicationNotificationMessage.id,
        status: applicationNotificationMessage.status,
      }).from(applicationNotificationMessage)
        .where(eq(applicationNotificationMessage.dedupeKey, dedupeKey))
        .limit(1)
        .for('update'))[0]
      if (!message) throw new Error('notification_message_missing')

      if (message.status !== 'pending') {
        const recoveryDedupeKey = `${dedupeKey}:recovery:${event.id}`
        message = (await tx.insert(applicationNotificationMessage).values({
          ...messageValues,
          dedupeKey: recoveryDedupeKey,
          availableAt: now,
        }).onConflictDoNothing({
          target: applicationNotificationMessage.dedupeKey,
        }).returning({ id: applicationNotificationMessage.id, status: applicationNotificationMessage.status }))[0]
          ?? (await tx.select({
            id: applicationNotificationMessage.id,
            status: applicationNotificationMessage.status,
          }).from(applicationNotificationMessage)
            .where(eq(applicationNotificationMessage.dedupeKey, recoveryDedupeKey))
            .limit(1)
            .for('update'))[0]
      }
      if (!message || message.status !== 'pending') throw new Error('notification_message_unavailable')

      await tx.insert(applicationNotificationDelivery).values({
        organizationId: event.organizationId,
        eventId: event.id,
        applicationId: event.applicationId,
        messageId: message.id,
        recipientKey: plan.recipientKey,
        recipientKind: plan.recipientKind,
        userId: plan.userId,
        memberId: plan.memberId,
        recipientEmail: plan.recipientEmail,
        cadence: plan.cadence,
        configurationKey: plan.configurationKey,
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

async function claimMessages(now: Date): Promise<NotificationClaimBatch<NotificationMessage>> {
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
    )).returning({
      id: applicationNotificationMessage.id,
      organizationId: applicationNotificationMessage.organizationId,
      attemptCount: applicationNotificationMessage.attemptCount,
      maxAttempts: applicationNotificationMessage.maxAttempts,
      cadence: applicationNotificationMessage.cadence,
      recipientKind: applicationNotificationMessage.recipientKind,
    })

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

    const exhaustedTransitions = exhausted.map(row => ({
      organizationId: row.organizationId,
      queueKind: 'message' as const,
      recordId: row.id,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      resultCode: 'lease_expired',
      retryable: false,
      cadence: row.cadence,
      recipientKind: row.recipientKind,
    }))

    if (claimable.length === 0) {
      return { claimed: [], exhausted: exhaustedTransitions }
    }
    const claimed = await tx.update(applicationNotificationMessage).set({
      status: 'processing',
      attemptCount: sql`${applicationNotificationMessage.attemptCount} + 1`,
      leaseExpiresAt: leaseExpiresAt(now),
      resultCode: null,
      updatedAt: now,
    }).where(inArray(applicationNotificationMessage.id, claimable.map(row => row.id))).returning()
    return { claimed, exhausted: exhaustedTransitions }
  })
}

async function cancelMessage(message: NotificationMessage, resultCode: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const cancelled = await tx.update(applicationNotificationMessage).set({
      status: 'cancelled',
      leaseExpiresAt: null,
      resultCode,
      completedAt: now,
      updatedAt: now,
    }).where(and(
      eq(applicationNotificationMessage.id, message.id),
      eq(applicationNotificationMessage.status, 'processing'),
      eq(applicationNotificationMessage.attemptCount, message.attemptCount),
    )).returning({ id: applicationNotificationMessage.id })
    if (cancelled.length === 0) return

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

  if (!message.userId || !message.memberId) return false
  const active = await db.select({ id: member.id })
    .from(member)
    .innerJoin(applicationNotificationSubscription, and(
      eq(applicationNotificationSubscription.organizationId, member.organizationId),
      eq(applicationNotificationSubscription.userId, member.userId),
      eq(applicationNotificationSubscription.memberId, member.id),
      eq(applicationNotificationSubscription.recipientKind, 'member'),
      ne(applicationNotificationSubscription.cadence, 'off'),
    ))
    .where(and(
      eq(member.organizationId, message.organizationId),
      eq(member.userId, message.userId),
      eq(member.id, message.memberId),
    ))
    .limit(1)
  return active.length > 0
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

async function processMessage(
  message: NotificationMessage,
  now: Date,
  sendNotification: ApplicationNotificationSender,
): Promise<ApplicationNotificationFailureTransition | null> {
  if (message.cadence === 'off' || !(await subscriptionStillActive(message))) {
    await cancelMessage(message, 'subscription_inactive', now)
    return null
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
    return null
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
    const providerMessageId = await sendNotification({
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
      const completed = await tx.update(applicationNotificationMessage).set({
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
      )).returning({ id: applicationNotificationMessage.id })
      if (completed.length === 0) return

      await tx.update(applicationNotificationDelivery).set({
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      }).where(and(
        eq(applicationNotificationDelivery.messageId, message.id),
        eq(applicationNotificationDelivery.status, 'pending'),
      ))
    })
    return null
  }
  catch (error) {
    const outcome = getApplicationNotificationFailureOutcome({
      attemptCount: message.attemptCount,
      maxAttempts: message.maxAttempts,
      now,
      failureCode: error instanceof Error ? error.name : 'provider_failed',
    })
    const transitioned = await db.transaction(async (tx) => {
      const transitioned = await tx.update(applicationNotificationMessage).set({
        ...outcome,
        leaseExpiresAt: null,
        updatedAt: now,
      }).where(and(
        eq(applicationNotificationMessage.id, message.id),
        eq(applicationNotificationMessage.status, 'processing'),
        eq(applicationNotificationMessage.attemptCount, message.attemptCount),
      )).returning({ id: applicationNotificationMessage.id })
      if (transitioned.length === 0) return null

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
      return transitioned[0] ?? null
    })
    if (!transitioned) return null
    return {
      organizationId: message.organizationId,
      queueKind: 'message',
      recordId: transitioned.id,
      attemptCount: message.attemptCount,
      maxAttempts: message.maxAttempts,
      resultCode: outcome.resultCode,
      retryable: outcome.status === 'pending',
      cadence: message.cadence,
      recipientKind: message.recipientKind,
    }
  }
}

export async function processApplicationNotificationCycle(
  now = new Date(),
  sendNotification: ApplicationNotificationSender = sendApplicationNotificationEmail,
  logger: ApplicationNotificationQueueLogger = defaultQueueLogger,
): Promise<void> {
  const eventBatch = await claimEvents(now)
  for (const transition of eventBatch.exhausted) {
    emitApplicationNotificationFailureTelemetry(transition, logger)
  }
  for (const event of eventBatch.claimed) {
    try {
      await fanOutEvent(event, now)
    }
    catch (error) {
      const transition = await failEvent(event, error, now)
      emitApplicationNotificationFailureTelemetry(transition, logger)
    }
  }

  const messageBatch = await claimMessages(now)
  for (const transition of messageBatch.exhausted) {
    emitApplicationNotificationFailureTelemetry(transition, logger)
  }
  for (const message of messageBatch.claimed) {
    const transition = await processMessage(message, now, sendNotification)
    emitApplicationNotificationFailureTelemetry(transition, logger)
  }
}
