import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envSchema } from '../../server/utils/env'
import { resolveMicrosoftCalendarDestinations } from '../../server/utils/calendar-destinations'
import { createMicrosoftCalendarEvents } from '../../server/utils/microsoft-calendar'

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'https://app.example.com',
  S3_ENDPOINT: 'https://s3.example.com',
  S3_ACCESS_KEY: 'test-key',
  S3_SECRET_KEY: 'test-secret',
  S3_BUCKET: 'test-bucket',
}

const originalEnv = { ...process.env }

function resetEnvCache() {
  delete (globalThis as Record<string, unknown>).__env
}

afterEach(() => {
  process.env = { ...originalEnv }
  Reflect.deleteProperty(globalThis, '$fetch')
  resetEnvCache()
})

describe('Microsoft Calendar app-only configuration', () => {
  it('accepts client-credentials calendar config with shared and user destinations', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      MICROSOFT_CALENDAR_AUTH_MODE: 'application',
      MICROSOFT_CALENDAR_CLIENT_ID: 'client-id',
      MICROSOFT_CALENDAR_CLIENT_SECRET: 'client-secret',
      MICROSOFT_CALENDAR_TENANT_ID: 'tenant-id',
      FACTORY_CAREERS_CALENDAR_SYNC_SHARED: 'true',
      FACTORY_CAREERS_CALENDAR_EMAIL: 'careers@thefactoryhq.com',
      FACTORY_CAREERS_CALENDAR_USER_EMAILS: 'Doug@thefactoryhq.com, recruiting@thefactoryhq.com',
      FACTORY_CAREERS_CALENDAR_SYNC_INTERVIEWERS: 'true',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.MICROSOFT_CALENDAR_AUTH_MODE).toBe('application')
      expect(result.data.FACTORY_CAREERS_CALENDAR_USER_EMAILS).toEqual([
        'doug@thefactoryhq.com',
        'recruiting@thefactoryhq.com',
      ])
      expect(result.data.FACTORY_CAREERS_CALENDAR_SYNC_INTERVIEWERS).toBe(true)
    }
  })

  it('rejects application mode when the tenant resolves to common', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      MICROSOFT_CALENDAR_AUTH_MODE: 'application',
      MICROSOFT_CALENDAR_CLIENT_ID: 'client-id',
      MICROSOFT_CALENDAR_CLIENT_SECRET: 'client-secret',
      MICROSOFT_CALENDAR_TENANT_ID: 'common',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.includes('MICROSOFT_CALENDAR_TENANT_ID'))).toBe(true)
    }
  })
})

describe('Microsoft Calendar destinations', () => {
  it('deduplicates destinations and uses the shared mailbox as the primary inviter', () => {
    const destinations = resolveMicrosoftCalendarDestinations({
      sharedCalendarEmail: 'careers@thefactoryhq.com',
      syncSharedCalendar: true,
      configuredUserEmails: ['Doug@thefactoryhq.com', 'careers@thefactoryhq.com'],
      syncInterviewers: true,
      interviewerEmails: ['doug@thefactoryhq.com', 'external@example.com', 'Recruiting@thefactoryhq.com'],
      allowedDomains: ['thefactoryhq.com'],
    })

    expect(destinations).toEqual([
      {
        type: 'shared_mailbox',
        email: 'careers@thefactoryhq.com',
        isPrimary: true,
      },
      {
        type: 'user_mailbox',
        email: 'doug@thefactoryhq.com',
        isPrimary: false,
      },
      {
        type: 'user_mailbox',
        email: 'recruiting@thefactoryhq.com',
        isPrimary: false,
      },
    ])
  })

  it('uses the first user mailbox as primary when shared calendar sync is disabled', () => {
    const destinations = resolveMicrosoftCalendarDestinations({
      sharedCalendarEmail: 'careers@thefactoryhq.com',
      syncSharedCalendar: false,
      configuredUserEmails: ['recruiting@thefactoryhq.com', 'doug@thefactoryhq.com'],
      syncInterviewers: false,
      interviewerEmails: ['ignored@thefactoryhq.com'],
      allowedDomains: ['thefactoryhq.com'],
    })

    expect(destinations.map(destination => ({
      email: destination.email,
      isPrimary: destination.isPrimary,
    }))).toEqual([
      { email: 'recruiting@thefactoryhq.com', isPrimary: true },
      { email: 'doug@thefactoryhq.com', isPrimary: false },
    ])
  })
})

describe('Microsoft Calendar app-only event creation', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      MICROSOFT_CALENDAR_AUTH_MODE: 'application',
      MICROSOFT_CALENDAR_CLIENT_ID: 'client-id',
      MICROSOFT_CALENDAR_CLIENT_SECRET: 'client-secret',
      MICROSOFT_CALENDAR_TENANT_ID: 'tenant-id',
      FACTORY_CAREERS_CALENDAR_EMAIL: 'careers@thefactoryhq.com',
      FACTORY_CAREERS_CALENDAR_SYNC_SHARED: 'true',
      FACTORY_CAREERS_CALENDAR_USER_EMAILS: 'doug@thefactoryhq.com',
      FACTORY_CAREERS_CALENDAR_SYNC_INTERVIEWERS: 'true',
      FACTORY_ALLOWED_EMAIL_DOMAINS: 'thefactoryhq.com',
    }
    resetEnvCache()
  })

  it('creates mailbox events and includes attendees only on the primary destination', async () => {
    const fetchMock = vi.fn(async (url: string, init?: { body?: unknown }) => {
      if (url.includes('/oauth2/v2.0/token')) {
        return { access_token: 'app-token' }
      }

      const eventNumber = fetchMock.mock.calls.filter(([calledUrl]) =>
        String(calledUrl).includes('graph.microsoft.com'),
      ).length
      return {
        id: `event-${eventNumber}`,
        webLink: `https://outlook.office.com/event-${eventNumber}`,
      }
    })
    vi.stubGlobal('$fetch', fetchMock)

    const results = await createMicrosoftCalendarEvents('user-1', 'org-1', {
      title: 'Interview',
      description: 'Interview details',
      startTime: new Date('2030-01-01T15:00:00Z'),
      durationMinutes: 60,
      timezone: 'UTC',
      location: 'Teams',
      candidateEmail: 'candidate@example.com',
      candidateName: 'Candidate Example',
      interviewerEmails: ['doug@thefactoryhq.com', 'recruiting@thefactoryhq.com'],
    })

    expect(results.map(result => ({
      email: result.destinationEmail,
      isPrimary: result.isPrimary,
      success: result.success,
    }))).toEqual([
      { email: 'careers@thefactoryhq.com', isPrimary: true, success: true },
      { email: 'doug@thefactoryhq.com', isPrimary: false, success: true },
      { email: 'recruiting@thefactoryhq.com', isPrimary: false, success: true },
    ])

    const eventCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('graph.microsoft.com'))
    expect(eventCalls.map(([url]) => String(url))).toEqual([
      'https://graph.microsoft.com/v1.0/users/careers%40thefactoryhq.com/calendar/events',
      'https://graph.microsoft.com/v1.0/users/doug%40thefactoryhq.com/calendar/events',
      'https://graph.microsoft.com/v1.0/users/recruiting%40thefactoryhq.com/calendar/events',
    ])

    const bodies = eventCalls.map(([, init]) => (init as { body: Record<string, unknown> }).body)
    expect(bodies[0].attendees).toEqual(expect.any(Array))
    expect(bodies[1]).not.toHaveProperty('attendees')
    expect(bodies[2]).not.toHaveProperty('attendees')
  })
})
