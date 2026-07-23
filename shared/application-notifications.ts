import { z } from 'zod'

export const APPLICATION_NOTIFICATION_CADENCES = [
  'immediate',
  'daily',
  'weekly',
  'monthly',
  'off',
] as const

export type ApplicationNotificationCadence = typeof APPLICATION_NOTIFICATION_CADENCES[number]

export const DEFAULT_HIRING_INBOX_NOTIFICATION_PREFERENCE = {
  cadence: 'weekly',
  deliveryTime: '09:00',
  weeklyDay: 1,
  monthlyDay: 1,
} as const

export const DEFAULT_MEMBER_NOTIFICATION_PREFERENCE = {
  cadence: 'off',
  deliveryTime: '09:00',
  weeklyDay: 1,
  monthlyDay: 1,
} as const

const deliveryTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Delivery time must use HH:mm')

export const applicationNotificationPreferenceSchema = z.object({
  cadence: z.enum(APPLICATION_NOTIFICATION_CADENCES),
  timeZone: z.string().trim().min(1).max(100).refine((timeZone) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format()
      return true
    }
    catch {
      return false
    }
  }, 'Invalid timezone'),
  deliveryTime: deliveryTimeSchema,
  weeklyDay: z.number().int().min(1).max(7),
  monthlyDay: z.number().int().min(1).max(28),
})

export const hiringInboxNotificationSettingsSchema = applicationNotificationPreferenceSchema.extend({
  recipientEmail: z.string().trim().toLowerCase().pipe(z.email()).nullable(),
})

export type ApplicationNotificationPreference = z.infer<typeof applicationNotificationPreferenceSchema>
export type HiringInboxNotificationSettings = z.infer<typeof hiringInboxNotificationSettingsSchema>

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const zonedFormatters = new Map<string, Intl.DateTimeFormat>()

function getZonedFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = zonedFormatters.get(timeZone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  zonedFormatters.set(timeZone, formatter)
  return formatter
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const values = Object.fromEntries(
    getZonedFormatter(timeZone).formatToParts(date).map(part => [part.type, part.value]),
  )
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour === '24' ? '0' : values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function sameLocalMinute(left: ZonedParts, right: Omit<ZonedParts, 'second'>): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone)
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    - Math.floor(date.getTime() / 1000) * 1000
}

function localMinuteInstants(parts: Omit<ZonedParts, 'second'>, timeZone: string): Date[] {
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  const sampleOffsets = new Set([
    getTimeZoneOffsetMs(new Date(localAsUtc - 36 * 60 * 60 * 1000), timeZone),
    getTimeZoneOffsetMs(new Date(localAsUtc), timeZone),
    getTimeZoneOffsetMs(new Date(localAsUtc + 36 * 60 * 60 * 1000), timeZone),
  ])

  return [...sampleOffsets]
    .map(offset => new Date(localAsUtc - offset))
    .filter(candidate => sameLocalMinute(getZonedParts(candidate, timeZone), parts))
    .sort((left, right) => left.getTime() - right.getTime())
}

function resolveLocalMinute(parts: Omit<ZonedParts, 'second'>, timeZone: string): Date {
  const direct = localMinuteInstants(parts, timeZone)
  if (direct[0]) return direct[0]

  const cursor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute))
  for (let minutes = 1; minutes <= 180; minutes += 1) {
    const next = new Date(cursor.getTime() + minutes * 60_000)
    const nextParts = {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: next.getUTCHours(),
      minute: next.getUTCMinutes(),
    }
    const candidates = localMinuteInstants(nextParts, timeZone)
    if (candidates[0]) return candidates[0]
  }

  throw new Error(`Unable to resolve local delivery time in ${timeZone}`)
}

function calendarDate(parts: Pick<ZonedParts, 'year' | 'month' | 'day'>, addDays = 0) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + addDays))
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  }
}

function parseDeliveryTime(deliveryTime: string) {
  const [hour, minute] = deliveryTime.split(':').map(Number)
  return { hour: hour!, minute: minute! }
}

function localIsoWeekday(parts: Pick<ZonedParts, 'year' | 'month' | 'day'>): number {
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export function calculateNextApplicationNotificationDelivery(
  preference: ApplicationNotificationPreference,
  from = new Date(),
): Date | null {
  if (preference.cadence === 'off') return null
  if (preference.cadence === 'immediate') return new Date(from)

  const localNow = getZonedParts(from, preference.timeZone)
  const time = parseDeliveryTime(preference.deliveryTime)
  let targetDate = calendarDate(localNow)

  if (preference.cadence === 'weekly') {
    const daysAhead = (preference.weeklyDay - localIsoWeekday(localNow) + 7) % 7
    targetDate = calendarDate(localNow, daysAhead)
  }
  else if (preference.cadence === 'monthly') {
    targetDate = { year: localNow.year, month: localNow.month, day: preference.monthlyDay }
  }

  let candidate = resolveLocalMinute({ ...targetDate, ...time }, preference.timeZone)
  if (candidate.getTime() > from.getTime()) return candidate

  if (preference.cadence === 'daily') {
    targetDate = calendarDate(targetDate, 1)
  }
  else if (preference.cadence === 'weekly') {
    targetDate = calendarDate(targetDate, 7)
  }
  else {
    const nextMonth = new Date(Date.UTC(targetDate.year, targetDate.month, 1))
    targetDate = {
      year: nextMonth.getUTCFullYear(),
      month: nextMonth.getUTCMonth() + 1,
      day: preference.monthlyDay,
    }
  }

  candidate = resolveLocalMinute({ ...targetDate, ...time }, preference.timeZone)
  return candidate
}
