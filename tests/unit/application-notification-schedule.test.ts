import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HIRING_INBOX_NOTIFICATION_PREFERENCE,
  DEFAULT_MEMBER_NOTIFICATION_PREFERENCE,
  applicationNotificationPreferenceSchema,
  calculateNextApplicationNotificationDelivery,
  hiringInboxNotificationSettingsSchema,
} from '../../shared/application-notifications'
import { cliHiringInboxNotificationSettingsSchema } from '../../packages/careers-cli/src/schemas'

describe('application notification schedules', () => {
  it('defaults the shared inbox to a Monday morning weekly digest and members to off', () => {
    expect(DEFAULT_HIRING_INBOX_NOTIFICATION_PREFERENCE).toEqual({
      cadence: 'weekly',
      deliveryTime: '09:00',
      weeklyDay: 1,
      monthlyDay: 1,
    })
    expect(DEFAULT_MEMBER_NOTIFICATION_PREFERENCE).toEqual({
      cadence: 'off',
      deliveryTime: '09:00',
      weeklyDay: 1,
      monthlyDay: 1,
    })
  })

  it('validates normalized schedule inputs and IANA timezones', () => {
    expect(applicationNotificationPreferenceSchema.parse({
      cadence: 'daily',
      deliveryTime: '08:30',
      timeZone: 'America/New_York',
      weeklyDay: 5,
      monthlyDay: 28,
    })).toEqual({
      cadence: 'daily',
      deliveryTime: '08:30',
      timeZone: 'America/New_York',
      weeklyDay: 5,
      monthlyDay: 28,
    })

    expect(() => applicationNotificationPreferenceSchema.parse({
      cadence: 'weekly',
      deliveryTime: '25:00',
      timeZone: 'Not/A_Timezone',
      weeklyDay: 0,
      monthlyDay: 29,
    })).toThrow()
  })

  it('normalizes inbox email before validating it in API and CLI contracts', () => {
    const input = {
      cadence: 'weekly' as const,
      deliveryTime: '09:00',
      timeZone: 'America/New_York',
      weeklyDay: 1,
      monthlyDay: 1,
      recipientEmail: '  Careers@Example.COM  ',
    }

    expect(hiringInboxNotificationSettingsSchema.parse(input).recipientEmail).toBe('careers@example.com')
    expect(cliHiringInboxNotificationSettingsSchema.parse(input).recipientEmail).toBe('careers@example.com')
  })

  it('schedules daily, weekly, and monthly deliveries in the configured timezone', () => {
    const from = new Date('2026-07-22T14:15:00.000Z') // Wednesday 10:15 in New York

    expect(calculateNextApplicationNotificationDelivery({
      cadence: 'daily',
      deliveryTime: '09:00',
      timeZone: 'America/New_York',
      weeklyDay: 1,
      monthlyDay: 1,
    }, from)?.toISOString()).toBe('2026-07-23T13:00:00.000Z')

    expect(calculateNextApplicationNotificationDelivery({
      cadence: 'weekly',
      deliveryTime: '09:00',
      timeZone: 'America/New_York',
      weeklyDay: 1,
      monthlyDay: 1,
    }, from)?.toISOString()).toBe('2026-07-27T13:00:00.000Z')

    expect(calculateNextApplicationNotificationDelivery({
      cadence: 'monthly',
      deliveryTime: '09:00',
      timeZone: 'America/New_York',
      weeklyDay: 1,
      monthlyDay: 28,
    }, from)?.toISOString()).toBe('2026-07-28T13:00:00.000Z')
  })

  it('rolls nonexistent DST times forward and chooses the earlier repeated time', () => {
    expect(calculateNextApplicationNotificationDelivery({
      cadence: 'daily',
      deliveryTime: '02:30',
      timeZone: 'America/New_York',
      weeklyDay: 1,
      monthlyDay: 1,
    }, new Date('2026-03-08T05:00:00.000Z'))?.toISOString()).toBe('2026-03-08T07:00:00.000Z')

    expect(calculateNextApplicationNotificationDelivery({
      cadence: 'daily',
      deliveryTime: '01:30',
      timeZone: 'America/New_York',
      weeklyDay: 1,
      monthlyDay: 1,
    }, new Date('2026-11-01T04:00:00.000Z'))?.toISOString()).toBe('2026-11-01T05:30:00.000Z')
  })

  it('returns now for immediate delivery and null for off', () => {
    const from = new Date('2026-07-22T14:15:00.000Z')
    const base = {
      deliveryTime: '09:00',
      timeZone: 'America/New_York',
      weeklyDay: 1,
      monthlyDay: 1,
    }

    expect(calculateNextApplicationNotificationDelivery({ ...base, cadence: 'immediate' }, from)).toEqual(from)
    expect(calculateNextApplicationNotificationDelivery({ ...base, cadence: 'off' }, from)).toBeNull()
  })
})
