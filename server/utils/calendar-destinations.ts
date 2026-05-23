export type CalendarDestinationType = 'shared_mailbox' | 'user_mailbox'

export interface CalendarDestination {
  type: CalendarDestinationType
  email: string
  isPrimary: boolean
}

interface ResolveMicrosoftCalendarDestinationsOptions {
  sharedCalendarEmail: string | null | undefined
  syncSharedCalendar: boolean
  configuredUserEmails: string[]
  syncInterviewers: boolean
  interviewerEmails: string[]
  allowedDomains: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized && EMAIL_RE.test(normalized) ? normalized : null
}

function isAllowedOrgEmail(email: string, allowedDomains: string[]): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false
  return allowedDomains.map(item => item.toLowerCase()).includes(domain)
}

export function resolveMicrosoftCalendarDestinations(
  options: ResolveMicrosoftCalendarDestinationsOptions,
): CalendarDestination[] {
  const destinations: Omit<CalendarDestination, 'isPrimary'>[] = []
  const seen = new Set<string>()

  const addDestination = (type: CalendarDestinationType, rawEmail: string | null | undefined) => {
    const email = normalizeEmail(rawEmail)
    if (!email || seen.has(email)) return
    seen.add(email)
    destinations.push({ type, email })
  }

  if (options.syncSharedCalendar) {
    addDestination('shared_mailbox', options.sharedCalendarEmail)
  }

  for (const email of options.configuredUserEmails) {
    addDestination('user_mailbox', email)
  }

  if (options.syncInterviewers) {
    for (const rawEmail of options.interviewerEmails) {
      const email = normalizeEmail(rawEmail)
      if (!email || !isAllowedOrgEmail(email, options.allowedDomains)) continue
      addDestination('user_mailbox', email)
    }
  }

  return destinations.map((destination, index) => ({
    ...destination,
    isPrimary: index === 0,
  }))
}
