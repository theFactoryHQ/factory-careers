export type CandidateWorkflowEmailPurpose =
  | 'application_acknowledgement'
  | 'application_rejection'

export type CandidateWorkflowEmailTiming = {
  delayMinutes?: number | null
  businessHoursOnly?: boolean | null
  businessHoursTimezone?: string | null
  businessHoursStartHour?: number | null
  businessHoursEndHour?: number | null
}

type BusinessHoursWindow = {
  timeZone: string
  startHour: number
  endHour: number
}

function normalizeBusinessHoursWindow(timing: CandidateWorkflowEmailTiming): BusinessHoursWindow {
  const timeZone = timing.businessHoursTimezone || 'America/New_York'
  const startHour = Math.min(23, Math.max(0, Number(timing.businessHoursStartHour ?? 9)))
  const endHour = Math.min(24, Math.max(startHour + 1, Number(timing.businessHoursEndHour ?? 17)))
  return { timeZone, startHour, endHour }
}

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: values.weekday ?? '',
    hour: Number(values.hour === '24' ? '0' : values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedDateParts(date, timeZone)
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return zonedAsUtc - date.getTime()
}

function dateFromZonedParts(
  parts: { year: number, month: number, day: number, hour: number },
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour)
  const firstPass = new Date(utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone))
  return new Date(utcGuess - getTimeZoneOffsetMs(firstPass, timeZone))
}

function weekdayIndex(weekday: string): number {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)
}

function nextBusinessDateAtStart(
  parts: ReturnType<typeof getZonedDateParts>,
  window: BusinessHoursWindow,
  addDays = 0,
): Date {
  let cursor = dateFromZonedParts({
    year: parts.year,
    month: parts.month,
    day: parts.day + addDays,
    hour: window.startHour,
  }, window.timeZone)

  while (true) {
    const cursorParts = getZonedDateParts(cursor, window.timeZone)
    const day = weekdayIndex(cursorParts.weekday)
    if (day >= 1 && day <= 5) return cursor
    cursor = dateFromZonedParts({
      year: cursorParts.year,
      month: cursorParts.month,
      day: cursorParts.day + 1,
      hour: window.startHour,
    }, window.timeZone)
  }
}

function nextBusinessSendTime(
  target: Date,
  timing: CandidateWorkflowEmailTiming,
): Date {
  const window = normalizeBusinessHoursWindow(timing)
  const parts = getZonedDateParts(target, window.timeZone)
  const day = weekdayIndex(parts.weekday)

  if (day === 0 || day === 6) {
    return nextBusinessDateAtStart(parts, window, 1)
  }
  if (parts.hour < window.startHour) {
    return nextBusinessDateAtStart(parts, window)
  }
  if (parts.hour >= window.endHour) {
    return nextBusinessDateAtStart(parts, window, 1)
  }
  return target
}

export function calculateCandidateWorkflowAvailableAt(
  timing: CandidateWorkflowEmailTiming,
  now: Date,
): Date {
  const delayMinutes = Math.max(0, Number(timing.delayMinutes ?? 0))
  const requested = new Date(now.getTime() + delayMinutes * 60_000)
  return timing.businessHoursOnly ? nextBusinessSendTime(requested, timing) : requested
}

export function getCandidateWorkflowEmailDedupeKey(input: {
  applicationId: string
  purpose: CandidateWorkflowEmailPurpose
  transitionAt: Date
}): string {
  const base = `candidate-workflow-email:${input.purpose}:${input.applicationId}`
  return input.purpose === 'application_acknowledgement'
    ? base
    : `${base}:${input.transitionAt.toISOString()}`
}

function sanitizeResultCode(value: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return normalized || 'candidate_workflow_email_failed'
}

export function getCandidateWorkflowEmailFailureOutcome(input: {
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
  const retryDelayMs = Math.min(
    60 * 60_000,
    30_000 * 2 ** Math.max(0, input.attemptCount - 1),
  )
  return {
    status: exhausted ? 'failed' : 'pending',
    resultCode: sanitizeResultCode(input.failureCode),
    availableAt: exhausted ? input.now : new Date(input.now.getTime() + retryDelayMs),
    completedAt: exhausted ? input.now : null,
  }
}
