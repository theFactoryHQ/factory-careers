/**
 * Google Calendar integration utility.
 *
 * Handles OAuth2 flow, token management, event CRUD, and webhook setup
 * for two-way interview scheduling sync.
 */
import { google, type calendar_v3 } from 'googleapis'
import { eq, and, exists, isNull } from 'drizzle-orm'
import { encrypt, decrypt } from './encryption'
import { calendarIntegration, interview } from '../database/schema'

export type GoogleCalendarIntegrationIdentity = Readonly<{
  integrationId: string
  userId: string
  organizationId: string | null
}>

export type GoogleCalendarIntegrationSnapshot = GoogleCalendarIntegrationIdentity & Readonly<{
  connectionGeneration: string
}>

function googleIntegrationConditions(identity: GoogleCalendarIntegrationIdentity) {
  return [
    eq(calendarIntegration.id, identity.integrationId),
    eq(calendarIntegration.userId, identity.userId),
    eq(calendarIntegration.provider, 'google'),
    identity.organizationId === null
      ? isNull(calendarIntegration.organizationId)
      : eq(calendarIntegration.organizationId, identity.organizationId),
  ] as const
}

function googleIntegrationWhere(identity: GoogleCalendarIntegrationIdentity) {
  return and(...googleIntegrationConditions(identity))
}

function googleCredentialGenerationWhere(
  identity: GoogleCalendarIntegrationIdentity,
  refreshTokenEncrypted: string,
) {
  return and(
    ...googleIntegrationConditions(identity),
    eq(calendarIntegration.refreshTokenEncrypted, refreshTokenEncrypted),
  )
}

function googleConnectionGenerationWhere(identity: GoogleCalendarIntegrationSnapshot) {
  return and(
    ...googleIntegrationConditions(identity),
    eq(calendarIntegration.connectionGeneration, identity.connectionGeneration),
  )
}

function calendarIntegrationConflict() {
  return createError({
    statusCode: 409,
    statusMessage: 'Google Calendar is already connected to a different organization or account',
  })
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ('code' in error && error.code === '23505') return true
  return 'cause' in error && isUniqueViolation(error.cause)
}

// ─────────────────────────────────────────────
// OAuth2 Client
// ─────────────────────────────────────────────

/**
 * Check if Google Calendar integration is configured.
 */
export function isGoogleCalendarConfigured(): boolean {
  if (env.FACTORY_CALENDAR_TEST_MODE === 'mock') return true
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

/**
 * Create a Google OAuth2 client with application credentials.
 */
function createOAuth2Client(redirectUri: string) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured')
  }
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  )
}

/**
 * Get the OAuth2 redirect URI based on the current deployment URL.
 */
function getRedirectUri(): string {
  const baseUrl = env.BETTER_AUTH_URL
    || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '')
    || 'https://thefactoryhq.com'
  return `${baseUrl}/api/calendar/google/callback`
}

/**
 * Generate the Google OAuth2 consent URL for calendar access.
 * Includes a CSRF state parameter to prevent forgery.
 */
export function getGoogleAuthUrl(stateToken: string): string {
  if (env.FACTORY_CALENDAR_TEST_MODE === 'mock') {
    const callbackUrl = new URL(getRedirectUri())
    callbackUrl.searchParams.set('code', 'mock-calendar-code')
    callbackUrl.searchParams.set('state', stateToken)
    return callbackUrl.toString()
  }

  const oauth2Client = createOAuth2Client(getRedirectUri())

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: stateToken,
  })
}

/**
 * Exchange an authorization code for OAuth2 tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string
  refreshToken: string
  email: string | null
}> {
  if (env.FACTORY_CALENDAR_TEST_MODE === 'mock') {
    if (code !== 'mock-calendar-code') {
      throw new Error('Invalid mock calendar authorization code')
    }

    return {
      accessToken: 'mock-calendar-access-token',
      refreshToken: 'mock-calendar-refresh-token',
      email: 'calendar.e2e@example.com',
    }
  }

  const oauth2Client = createOAuth2Client(getRedirectUri())
  const { tokens } = await oauth2Client.getToken(code)

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain OAuth tokens — ensure consent prompt is shown')
  }

  // Fetch the connected Google account email
  oauth2Client.setCredentials(tokens)
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  let email: string | null = null
  try {
    const userInfo = await oauth2.userinfo.get()
    email = userInfo.data.email ?? null
  }
  catch {
    // Non-critical — email is for display only
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    email,
  }
}

// ─────────────────────────────────────────────
// Token Management
// ─────────────────────────────────────────────

function calendarClientFromEncryptedTokens(
  userId: string,
  accessTokenEncrypted: string | null,
  refreshTokenEncrypted: string | null,
): calendar_v3.Calendar | null {
  const secret = env.BETTER_AUTH_SECRET
  const accessToken = accessTokenEncrypted ? decrypt(accessTokenEncrypted, secret) : null
  const refreshToken = refreshTokenEncrypted ? decrypt(refreshTokenEncrypted, secret) : null
  if (!accessToken || !refreshToken) {
    logError('calendar.token_decrypt_failed', { posthog_distinct_id: userId })
    return null
  }

  const oauth2Client = createOAuth2Client(getRedirectUri())
  oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken })
  return google.calendar({ version: 'v3', auth: oauth2Client })
}

/**
 * Get an authenticated Google Calendar client for a user.
 * Decrypts stored tokens and handles automatic refresh.
 */
export async function getCalendarClient(
  owner: string | GoogleCalendarIntegrationIdentity,
  expectedRefreshTokenEncrypted?: string,
): Promise<calendar_v3.Calendar | null> {
  const userId = typeof owner === 'string' ? owner : owner.userId
  const integration = await db.query.calendarIntegration.findFirst({
    where: typeof owner === 'string'
      ? and(
          eq(calendarIntegration.userId, userId),
          eq(calendarIntegration.provider, 'google'),
          ...(expectedRefreshTokenEncrypted
            ? [eq(calendarIntegration.refreshTokenEncrypted, expectedRefreshTokenEncrypted)]
            : []),
        )
      : and(
          ...googleIntegrationConditions(owner),
          ...(expectedRefreshTokenEncrypted
            ? [eq(calendarIntegration.refreshTokenEncrypted, expectedRefreshTokenEncrypted)]
            : []),
        ),
  })

  if (!integration) return null

  const secret = env.BETTER_AUTH_SECRET
  const loadedAccessTokenEncrypted = integration.accessTokenEncrypted
  const loadedRefreshTokenEncrypted = integration.refreshTokenEncrypted
  const accessToken = loadedAccessTokenEncrypted ? decrypt(loadedAccessTokenEncrypted, secret) : null
  const refreshToken = loadedRefreshTokenEncrypted ? decrypt(loadedRefreshTokenEncrypted, secret) : null

  if (!loadedAccessTokenEncrypted || !loadedRefreshTokenEncrypted || !accessToken || !refreshToken) {
    logError('calendar.token_decrypt_failed', {
      posthog_distinct_id: userId,
    })
    return null
  }

  const oauth2Client = createOAuth2Client(getRedirectUri())
  let credentialVersion = loadedAccessTokenEncrypted
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  // Listen for token refresh events and persist the new access token
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      try {
        const newAccessTokenEncrypted = encrypt(tokens.access_token, secret)
        const persisted = await db.update(calendarIntegration)
          .set({
            accessTokenEncrypted: newAccessTokenEncrypted,
            updatedAt: new Date(),
          })
          .where(typeof owner === 'string'
            ? and(
                eq(calendarIntegration.userId, userId),
                eq(calendarIntegration.provider, 'google'),
                eq(calendarIntegration.accessTokenEncrypted, credentialVersion),
              )
            : and(
                ...googleIntegrationConditions(owner),
                eq(calendarIntegration.accessTokenEncrypted, credentialVersion),
              ))
          .returning({ id: calendarIntegration.id })
        if (persisted[0]) credentialVersion = newAccessTokenEncrypted
      }
      catch (err) {
        logError('calendar.token_refresh_persist_failed', {
          posthog_distinct_id: userId,
          error_message: err instanceof Error ? err.message : String(err),
        })
      }
    }
  })

  return google.calendar({ version: 'v3', auth: oauth2Client })
}

/**
 * Save or update calendar integration credentials for a user.
 */
export async function saveCalendarIntegration(userId: string, organizationId: string, params: {
  accessToken: string
  refreshToken: string
  email: string | null
}): Promise<GoogleCalendarIntegrationIdentity> {
  const secret = env.BETTER_AUTH_SECRET
  const accessTokenEncrypted = encrypt(params.accessToken, secret)
  const refreshTokenEncrypted = encrypt(params.refreshToken, secret)
  const connectionGeneration = crypto.randomUUID()

  try {
    return await db.transaction(async (tx) => {
      const existingForUser = await tx.query.calendarIntegration.findFirst({
        where: and(eq(calendarIntegration.userId, userId), eq(calendarIntegration.provider, 'google')),
      })
      const existingForOrganization = await tx.query.calendarIntegration.findFirst({
        where: and(
          eq(calendarIntegration.organizationId, organizationId),
          eq(calendarIntegration.provider, 'google'),
        ),
      })

      if (existingForUser?.organizationId && existingForUser.organizationId !== organizationId) {
        throw calendarIntegrationConflict()
      }
      if (existingForOrganization && existingForOrganization.id !== existingForUser?.id) {
        throw calendarIntegrationConflict()
      }

      if (existingForUser) {
        const previousIdentity: GoogleCalendarIntegrationIdentity = {
          integrationId: existingForUser.id,
          userId,
          organizationId: existingForUser.organizationId,
        }
        const identity: GoogleCalendarIntegrationIdentity = {
          integrationId: existingForUser.id,
          userId,
          organizationId,
        }
        const updated = await tx.update(calendarIntegration)
          .set({
            organizationId,
            connectionGeneration,
            accessTokenEncrypted,
            refreshTokenEncrypted,
            accountEmail: params.email,
            webhookChannelId: null,
            webhookResourceId: null,
            webhookExpiration: null,
            syncToken: null,
            updatedAt: new Date(),
          })
          .where(googleIntegrationWhere(previousIdentity))
          .returning({ id: calendarIntegration.id })

        if (!updated[0]) throw calendarIntegrationConflict()
        return identity
      }

      const inserted = await tx.insert(calendarIntegration)
        .values({
          userId,
          organizationId,
          provider: 'google',
          connectionGeneration,
          accessTokenEncrypted,
          refreshTokenEncrypted,
          accountEmail: params.email,
        })
        .returning({ id: calendarIntegration.id })
      const integrationId = inserted[0]?.id
      if (!integrationId) throw new Error('Failed to save Google Calendar integration')

      return { integrationId, userId, organizationId }
    })
  }
  catch (error) {
    if (isUniqueViolation(error)) throw calendarIntegrationConflict()
    throw error
  }
}

/**
 * Remove calendar integration for a user.
 * Stops the webhook channel and deletes stored credentials.
 */
export async function removeCalendarIntegration(identity: GoogleCalendarIntegrationSnapshot): Promise<boolean> {
  const { userId } = identity
  const selectedWhere = googleConnectionGenerationWhere(identity)
  const deleted = await db.delete(calendarIntegration)
    .where(selectedWhere)
    .returning({
      id: calendarIntegration.id,
      accessTokenEncrypted: calendarIntegration.accessTokenEncrypted,
      refreshTokenEncrypted: calendarIntegration.refreshTokenEncrypted,
      webhookChannelId: calendarIntegration.webhookChannelId,
      webhookResourceId: calendarIntegration.webhookResourceId,
    })
  const integration = deleted[0]
  if (!integration) return false
  if (env.FACTORY_CALENDAR_TEST_MODE === 'mock') return true

  // Stop the webhook channel if active
  if (integration.webhookChannelId && integration.webhookResourceId) {
    try {
      const calendar = calendarClientFromEncryptedTokens(
        userId,
        integration.accessTokenEncrypted,
        integration.refreshTokenEncrypted,
      )
      if (calendar) {
        await calendar.channels.stop({
          requestBody: {
            id: integration.webhookChannelId,
            resourceId: integration.webhookResourceId,
          },
        })
      }
    }
    catch (err) {
      // Non-critical — channel may have already expired
      logWarn('calendar.webhook_channel_stop_failed', {
        posthog_distinct_id: userId,
        error_message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return true
}

// ─────────────────────────────────────────────
// Calendar Event CRUD
// ─────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

interface InterviewEventData {
  title: string
  description: string
  startTime: Date
  durationMinutes: number
  timezone: string
  location: string | null
  candidateEmail: string | null
  candidateName: string
  interviewerEmails: string[]
  sendUpdates?: boolean
}

/**
 * Create a Google Calendar event for an interview.
 * Adds the candidate and interviewers as attendees for two-way communication.
 * Returns the created event ID and HTML link, or null if creation failed.
 */
export async function createCalendarEvent(
  owner: string | GoogleCalendarIntegrationIdentity,
  data: InterviewEventData,
): Promise<{ id: string; htmlLink: string } | null> {
  const userId = typeof owner === 'string' ? owner : owner.userId
  if (env.FACTORY_CALENDAR_TEST_MODE === 'mock') {
    const eventId = `mock-google-event-${data.startTime.getTime()}`
    return {
      id: eventId,
      htmlLink: `https://calendar.test.local/events/${eventId}`,
    }
  }

  const integration = await db.query.calendarIntegration.findFirst({
    where: typeof owner === 'string'
      ? and(eq(calendarIntegration.userId, userId), eq(calendarIntegration.provider, 'google'))
      : googleIntegrationWhere(owner),
    columns: { calendarId: true, refreshTokenEncrypted: true },
  })

  if (!integration?.refreshTokenEncrypted) return null
  const calendar = await getCalendarClient(owner, integration.refreshTokenEncrypted)
  if (!calendar) return null

  const calendarId = integration?.calendarId || 'primary'

  const endTime = new Date(data.startTime.getTime() + data.durationMinutes * 60_000)

  const candidateEmailTrimmed = data.candidateEmail?.trim() || null
  const validInterviewerEmails = data.interviewerEmails
    .map(e => e.trim())
    .filter(e => isValidEmail(e))

  const attendees: calendar_v3.Schema$EventAttendee[] = [
    ...(candidateEmailTrimmed && isValidEmail(candidateEmailTrimmed)
      ? [{
          email: candidateEmailTrimmed,
          displayName: data.candidateName,
          responseStatus: 'needsAction' as const,
        }]
      : []),
    ...validInterviewerEmails.map(email => ({
      email,
      responseStatus: 'accepted' as const,
    })),
  ]

  try {
    const response = await calendar.events.insert({
      calendarId,
      sendUpdates: data.sendUpdates !== false ? 'all' : 'none',
      requestBody: {
        summary: data.title,
        description: data.description,
        start: {
          dateTime: data.startTime.toISOString(),
          timeZone: data.timezone,
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: data.timezone,
        },
        location: data.location || undefined,
        attendees,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 15 },
            { method: 'email', minutes: 60 },
          ],
        },
        guestsCanModify: false,
        guestsCanInviteOthers: false,
        transparency: 'opaque',
        status: 'confirmed',
      },
    })

    const id = response.data.id
    const htmlLink = response.data.htmlLink
    if (!id || !htmlLink) return null
    return { id, htmlLink }
  }
  catch (err) {
    logError('calendar.create_event_failed', {
      posthog_distinct_id: userId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Update an existing Google Calendar event.
 * Returns the htmlLink if the update succeeded, or null on failure.
 */
export async function updateCalendarEvent(
  owner: string | GoogleCalendarIntegrationIdentity,
  eventId: string,
  data: Partial<InterviewEventData>,
): Promise<string | null> {
  const userId = typeof owner === 'string' ? owner : owner.userId
  if (env.FACTORY_CALENDAR_TEST_MODE === 'mock') {
    return `https://calendar.test.local/events/${encodeURIComponent(eventId)}`
  }

  const integration = await db.query.calendarIntegration.findFirst({
    where: typeof owner === 'string'
      ? and(eq(calendarIntegration.userId, userId), eq(calendarIntegration.provider, 'google'))
      : googleIntegrationWhere(owner),
    columns: { calendarId: true, refreshTokenEncrypted: true },
  })

  if (!integration?.refreshTokenEncrypted) return null
  const calendar = await getCalendarClient(owner, integration.refreshTokenEncrypted)
  if (!calendar) return null

  const calendarId = integration?.calendarId || 'primary'

  const patch: calendar_v3.Schema$Event = {}

  if (data.title) patch.summary = data.title
  if (data.description) patch.description = data.description
  if (data.location !== undefined) patch.location = data.location || undefined

  if (data.startTime && data.durationMinutes) {
    const endTime = new Date(data.startTime.getTime() + data.durationMinutes * 60_000)
    patch.start = {
      dateTime: data.startTime.toISOString(),
      timeZone: data.timezone || 'UTC',
    }
    patch.end = {
      dateTime: endTime.toISOString(),
      timeZone: data.timezone || 'UTC',
    }
  }

  if (data.candidateEmail || data.interviewerEmails) {
    const attendees: calendar_v3.Schema$EventAttendee[] = []
    const candidateEmailTrimmed = data.candidateEmail?.trim() || null
    if (candidateEmailTrimmed && isValidEmail(candidateEmailTrimmed)) {
      attendees.push({
        email: candidateEmailTrimmed,
        displayName: data.candidateName,
        responseStatus: 'needsAction',
      })
    }
    if (data.interviewerEmails) {
      const validEmails = data.interviewerEmails
        .map(e => e.trim())
        .filter(e => isValidEmail(e))
      attendees.push(...validEmails.map(email => ({
        email,
        responseStatus: 'accepted' as const,
      })))
    }
    patch.attendees = attendees
  }

  try {
    const response = await calendar.events.patch({
      calendarId,
      eventId,
      sendUpdates: 'all',
      requestBody: patch,
    })
    return response.data.htmlLink ?? null
  }
  catch (err) {
    logError('calendar.update_event_failed', {
      posthog_distinct_id: userId,
      event_id: eventId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Cancel a Google Calendar event (set status to cancelled).
 * Sends cancellation notifications to all attendees.
 */
export async function cancelCalendarEvent(
  owner: string | GoogleCalendarIntegrationIdentity,
  eventId: string,
): Promise<boolean> {
  const userId = typeof owner === 'string' ? owner : owner.userId
  if (env.FACTORY_CALENDAR_TEST_MODE === 'mock') return true

  const integration = await db.query.calendarIntegration.findFirst({
    where: typeof owner === 'string'
      ? and(eq(calendarIntegration.userId, userId), eq(calendarIntegration.provider, 'google'))
      : googleIntegrationWhere(owner),
    columns: { calendarId: true, refreshTokenEncrypted: true },
  })

  if (!integration?.refreshTokenEncrypted) return false
  const calendar = await getCalendarClient(owner, integration.refreshTokenEncrypted)
  if (!calendar) return false

  const calendarId = integration?.calendarId || 'primary'

  try {
    await calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: 'all',
    })
    return true
  }
  catch (err) {
    logError('calendar.cancel_event_failed', {
      posthog_distinct_id: userId,
      event_id: eventId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

// ─────────────────────────────────────────────
// Webhook (Push Notifications) for Two-Way Sync
// ─────────────────────────────────────────────

/**
 * Set up a Google Calendar webhook to receive push notifications
 * when events change (e.g., candidate accepts/declines via Google Calendar).
 */
export async function setupCalendarWebhook(identity: GoogleCalendarIntegrationIdentity): Promise<boolean> {
  if (env.FACTORY_CALENDAR_TEST_MODE === 'mock') return false

  const { userId } = identity
  const integration = await db.query.calendarIntegration.findFirst({
    where: googleIntegrationWhere(identity),
    columns: {
      calendarId: true,
      refreshTokenEncrypted: true,
      webhookChannelId: true,
      webhookResourceId: true,
    },
  })

  if (!integration?.refreshTokenEncrypted) return false

  const calendar = await getCalendarClient(identity, integration.refreshTokenEncrypted)
  if (!calendar) return false

  // Stop existing channel if any
  if (integration.webhookChannelId && integration.webhookResourceId) {
    try {
      await calendar.channels.stop({
        requestBody: {
          id: integration.webhookChannelId,
          resourceId: integration.webhookResourceId,
        },
      })
    }
    catch {
      // Ignore — may have already expired
    }
  }

  const baseUrl = env.BETTER_AUTH_URL
    || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '')
    || 'https://thefactoryhq.com'

  const channelId = crypto.randomUUID()
  const calendarId = integration.calendarId || 'primary'

  try {
    const response = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: `${baseUrl}/api/calendar/webhook`,
        // Google allows max ~7 days (604800 seconds)
        params: {
          ttl: '604800',
        },
      },
    })

    // Store the channel info for later stop/renewal
    const updated = await db.update(calendarIntegration)
      .set({
        webhookChannelId: channelId,
        webhookResourceId: response.data.resourceId ?? null,
        webhookExpiration: response.data.expiration
          ? new Date(Number(response.data.expiration))
          : null,
        updatedAt: new Date(),
      })
      .where(and(
        ...googleIntegrationConditions(identity),
        eq(calendarIntegration.refreshTokenEncrypted, integration.refreshTokenEncrypted),
        integration.webhookChannelId === null
          ? isNull(calendarIntegration.webhookChannelId)
          : eq(calendarIntegration.webhookChannelId, integration.webhookChannelId),
      ))
      .returning({ id: calendarIntegration.id })

    if (!updated[0]) {
      if (response.data.resourceId) {
        await calendar.channels.stop({
          requestBody: { id: channelId, resourceId: response.data.resourceId },
        }).catch(() => undefined)
      }
      return false
    }

    // Do an initial sync to get the syncToken
    await performIncrementalSync(identity)

    return true
  }
  catch (err) {
    logError('calendar.webhook_setup_failed', {
      posthog_distinct_id: userId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * Perform an incremental sync to process changes from Google Calendar.
 * Updates interview candidateResponse based on attendee RSVP status.
 */
export async function performIncrementalSync(identity: GoogleCalendarIntegrationIdentity): Promise<void> {
  if (env.FACTORY_CALENDAR_TEST_MODE === 'mock') return

  const { userId } = identity
  const integration = await db.query.calendarIntegration.findFirst({
    where: googleIntegrationWhere(identity),
  })

  if (!integration?.refreshTokenEncrypted) return

  const credentialGeneration = integration.refreshTokenEncrypted
  const calendar = await getCalendarClient(identity, credentialGeneration)
  if (!calendar) return

  const calendarId = integration.calendarId || 'primary'

  try {
    let pageToken: string | undefined
    let nextSyncToken: string | undefined

    do {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId,
        singleEvents: true,
        maxResults: 50,
      }

      if (integration.syncToken && !pageToken) {
        params.syncToken = integration.syncToken
      }
      else if (!integration.syncToken && !pageToken) {
        // First sync — only look at future events
        params.timeMin = new Date().toISOString()
      }

      if (pageToken) {
        params.pageToken = pageToken
      }

      let data: { items?: { id?: string | null, attendees?: { email?: string | null, responseStatus?: string | null }[], status?: string | null }[], nextPageToken?: string | null, nextSyncToken?: string | null }

      try {
        const response = await (calendar.events.list(params) as any)
        data = response.data
      }
      catch (err: unknown) {
        // If syncToken is invalid (410 Gone), clear it and do a full re-sync
        if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 410) {
          if (integration.syncToken) {
            const cleared = await db.update(calendarIntegration)
              .set({ syncToken: null, updatedAt: new Date() })
              .where(googleCredentialGenerationWhere(identity, credentialGeneration))
              .returning({ id: calendarIntegration.id })
            if (cleared[0]) return await performIncrementalSync(identity)
            return
          }
          // Already cleared syncToken but still getting 410 — bail out
          logError('calendar.persistent_410_error', {
            posthog_distinct_id: userId,
          })
          return
        }
        throw err
      }

      const events = data.items ?? []

      const generationStillCurrent = await db.query.calendarIntegration.findFirst({
        where: googleCredentialGenerationWhere(identity, credentialGeneration),
        columns: { id: true },
      })
      if (!generationStillCurrent) return

      for (const event of events) {
        if (!event.id) continue
        if (identity.organizationId !== null) {
          await syncEventAttendeeStatus(
            event,
            identity,
            credentialGeneration,
          )
        }
      }

      pageToken = data.nextPageToken ?? undefined
      nextSyncToken = data.nextSyncToken ?? undefined
    } while (pageToken)

    // Save the sync token for next incremental sync
    if (nextSyncToken) {
      await db.update(calendarIntegration)
        .set({ syncToken: nextSyncToken, updatedAt: new Date() })
        .where(googleCredentialGenerationWhere(identity, credentialGeneration))
    }
  }
  catch (err) {
    logError('calendar.incremental_sync_failed', {
      posthog_distinct_id: userId,
      error_message: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Map a Google Calendar attendee RSVP status to our candidateResponse enum.
 */
function mapAttendeeStatus(
  googleStatus: string | null | undefined,
): 'accepted' | 'declined' | 'tentative' | 'pending' | null {
  switch (googleStatus) {
    case 'accepted': return 'accepted'
    case 'declined': return 'declined'
    case 'tentative': return 'tentative'
    case 'needsAction': return 'pending'
    default: return null
  }
}

/**
 * Sync a single Google Calendar event's attendee status back to the interview.
 */
async function syncEventAttendeeStatus(
  event: calendar_v3.Schema$Event,
  identity: GoogleCalendarIntegrationIdentity,
  credentialGeneration: string,
): Promise<void> {
  if (!event.id) return
  if (identity.organizationId === null) return
  const organizationId = identity.organizationId

  // Find the interview linked to this Google Calendar event
  const interviewRecord = await db.query.interview.findFirst({
    where: and(
      eq(interview.googleCalendarEventId, event.id),
      eq(interview.organizationId, organizationId),
    ),
    with: {
      application: {
        with: {
          candidate: { columns: { email: true } },
        },
      },
    },
  })

  if (!interviewRecord) return

  // Find the candidate's attendee status
  const candidateEmail = interviewRecord.application?.candidate?.email
  if (!candidateEmail || !event.attendees) return

  const candidateAttendee = event.attendees.find(
    a => a.email?.toLowerCase() === candidateEmail.toLowerCase(),
  )

  if (!candidateAttendee) return

  const newStatus = mapAttendeeStatus(candidateAttendee.responseStatus)
  if (!newStatus || newStatus === interviewRecord.candidateResponse) return

  // Update the interview with the new candidate response
  await db.update(interview)
    .set({
      candidateResponse: newStatus,
      candidateRespondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(interview.id, interviewRecord.id),
      eq(interview.organizationId, organizationId),
      exists(
        db.select({ id: calendarIntegration.id })
          .from(calendarIntegration)
          .where(googleCredentialGenerationWhere(identity, credentialGeneration)),
      ),
    ))

  console.info(
    `[Calendar] Synced candidate response for interview ${interviewRecord.id}: ` +
    `${interviewRecord.candidateResponse} → ${newStatus}`,
  )
}
