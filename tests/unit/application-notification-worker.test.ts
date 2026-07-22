import { describe, expect, it } from 'vitest'
import {
  buildApplicationNotificationRecipientPlans,
  getApplicationNotificationFailureOutcome,
  getApplicationNotificationMessageDedupeKey,
} from '../../shared/application-notification-delivery'

describe('application notification fan-out', () => {
  const createdAt = new Date('2026-07-22T14:00:00.000Z')

  it('keeps shared and personal delivery independent when their email addresses match', () => {
    const plans = buildApplicationNotificationRecipientPlans({
      createdAt,
      inbox: {
        recipientEmail: 'careers@example.com',
        cadence: 'weekly',
        timeZone: 'America/New_York',
        deliveryTime: '09:00',
        weeklyDay: 1,
        monthlyDay: 1,
      },
      members: [{
        userId: 'user-1',
        recipientEmail: 'careers@example.com',
        membershipCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
        cadence: 'immediate',
        timeZone: 'America/New_York',
        deliveryTime: '09:00',
        weeklyDay: 1,
        monthlyDay: 1,
      }],
    })

    expect(plans).toHaveLength(2)
    expect(plans.map(plan => plan.recipientKey)).toEqual(['hiring_inbox', 'member:user-1'])
    expect(plans[0]?.scheduledFor.toISOString()).toBe('2026-07-27T13:00:00.000Z')
    expect(plans[1]?.scheduledFor.toISOString()).toBe(createdAt.toISOString())
  })

  it('suppresses off subscriptions and members who joined after the application', () => {
    const plans = buildApplicationNotificationRecipientPlans({
      createdAt,
      inbox: null,
      members: [{
        userId: 'user-1',
        recipientEmail: 'one@example.com',
        membershipCreatedAt: new Date('2026-07-22T14:01:00.000Z'),
        cadence: 'daily',
        timeZone: 'UTC',
        deliveryTime: '09:00',
        weeklyDay: 1,
        monthlyDay: 1,
      }, {
        userId: 'user-2',
        recipientEmail: 'two@example.com',
        membershipCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
        cadence: 'off',
        timeZone: 'UTC',
        deliveryTime: '09:00',
        weeklyDay: 1,
        monthlyDay: 1,
      }],
    })

    expect(plans).toEqual([])
  })

  it('uses stable digest and immediate message keys', () => {
    expect(getApplicationNotificationMessageDedupeKey({
      organizationId: 'org-1',
      eventId: 'event-1',
      recipientKey: 'hiring_inbox',
      cadence: 'immediate',
      scheduledFor: createdAt,
    })).toBe('application-notification:immediate:event-1:hiring_inbox')

    expect(getApplicationNotificationMessageDedupeKey({
      organizationId: 'org-1',
      eventId: 'event-2',
      recipientKey: 'member:user-1',
      cadence: 'weekly',
      scheduledFor: new Date('2026-07-27T13:00:00.000Z'),
    })).toBe('application-notification:digest:org-1:member:user-1:weekly:2026-07-27T13:00:00.000Z')
  })

  it('bounds retries and exposes only sanitized result codes', () => {
    expect(getApplicationNotificationFailureOutcome({
      attemptCount: 1,
      maxAttempts: 5,
      now: createdAt,
      failureCode: 'Resend 503: upstream timeout!',
    })).toEqual({
      status: 'pending',
      resultCode: 'resend_503_upstream_timeout',
      availableAt: new Date('2026-07-22T14:00:30.000Z'),
      completedAt: null,
    })

    expect(getApplicationNotificationFailureOutcome({
      attemptCount: 5,
      maxAttempts: 5,
      now: createdAt,
      failureCode: 'provider failed',
    })).toEqual({
      status: 'failed',
      resultCode: 'provider_failed',
      availableAt: createdAt,
      completedAt: createdAt,
    })
  })
})
