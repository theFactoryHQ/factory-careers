import {
  calculateNextApplicationNotificationDelivery,
  type ApplicationNotificationCadence,
  type ApplicationNotificationPreference,
} from './application-notifications'

type InboxRecipient = ApplicationNotificationPreference & {
  recipientEmail: string
}

type MemberRecipient = ApplicationNotificationPreference & {
  userId: string
  recipientEmail: string
  membershipCreatedAt: Date
}

export type ApplicationNotificationRecipientPlan = ApplicationNotificationPreference & {
  recipientKind: 'hiring_inbox' | 'member'
  recipientKey: string
  recipientEmail: string
  userId: string | null
  scheduledFor: Date
}

export function buildApplicationNotificationRecipientPlans(input: {
  createdAt: Date
  inbox: InboxRecipient | null
  members: MemberRecipient[]
}): ApplicationNotificationRecipientPlan[] {
  const plans: ApplicationNotificationRecipientPlan[] = []

  if (input.inbox && input.inbox.cadence !== 'off') {
    const scheduledFor = calculateNextApplicationNotificationDelivery(input.inbox, input.createdAt)
    if (scheduledFor) {
      plans.push({
        ...input.inbox,
        recipientKind: 'hiring_inbox',
        recipientKey: 'hiring_inbox',
        userId: null,
        scheduledFor,
      })
    }
  }

  for (const member of input.members) {
    if (member.cadence === 'off' || member.membershipCreatedAt > input.createdAt) continue
    const scheduledFor = calculateNextApplicationNotificationDelivery(member, input.createdAt)
    if (!scheduledFor) continue

    plans.push({
      cadence: member.cadence,
      timeZone: member.timeZone,
      deliveryTime: member.deliveryTime,
      weeklyDay: member.weeklyDay,
      monthlyDay: member.monthlyDay,
      recipientKind: 'member',
      recipientKey: `member:${member.userId}`,
      recipientEmail: member.recipientEmail,
      userId: member.userId,
      scheduledFor,
    })
  }

  return plans
}

export function getApplicationNotificationMessageDedupeKey(input: {
  organizationId: string
  eventId: string
  recipientKey: string
  cadence: ApplicationNotificationCadence
  scheduledFor: Date
}): string {
  if (input.cadence === 'immediate') {
    return `application-notification:immediate:${input.eventId}:${input.recipientKey}`
  }
  return [
    'application-notification',
    'digest',
    input.organizationId,
    input.recipientKey,
    input.cadence,
    input.scheduledFor.toISOString(),
  ].join(':')
}

function sanitizeResultCode(value: string): string {
  const normalized = value.toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return normalized || 'notification_delivery_failed'
}

export function getApplicationNotificationFailureOutcome(input: {
  attemptCount: number
  maxAttempts: number
  now: Date
  failureCode: string
}): {
  status: 'pending' | 'failed'
  resultCode: string
  availableAt: Date
  completedAt: Date | null
} {
  const exhausted = input.attemptCount >= input.maxAttempts
  const retryDelayMs = Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, input.attemptCount - 1))
  return {
    status: exhausted ? 'failed' : 'pending',
    resultCode: sanitizeResultCode(input.failureCode),
    availableAt: exhausted ? input.now : new Date(input.now.getTime() + retryDelayMs),
    completedAt: exhausted ? input.now : null,
  }
}
