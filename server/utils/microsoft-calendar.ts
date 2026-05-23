/**
 * Microsoft Calendar integration utility.
 *
 * Uses Microsoft identity platform OAuth2 + Microsoft Graph delegated group
 * calendar APIs to create, update, and cancel interview events on Factory's
 * shared Microsoft 365 group calendar.
 */
import { and, eq } from 'drizzle-orm'
import { env } from './env'
import { encrypt, decrypt } from './encryption'
import { calendarIntegration, orgSettings } from '../database/schema'
import { db } from './db'
import {
  resolveMicrosoftCalendarDestinations,
  type CalendarDestination,
} from './calendar-destinations'

type MicrosoftCalendarConfig = {
  clientId: string
  clientSecret: string
  tenantId: string
}

type MicrosoftTokenResponse = {
  access_token?: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
}

type MicrosoftUserResponse = {
  mail?: string | null
  userPrincipalName?: string | null
}

type MicrosoftGroupResponse = {
  id?: string | null
  displayName?: string | null
  mail?: string | null
}

type MicrosoftGroupListResponse = {
  value?: MicrosoftGroupResponse[]
}

type MicrosoftEventResponse = {
  id?: string | null
  webLink?: string | null
}

type MicrosoftGraphContext = {
  accessToken: string
  integrationId: string
  calendarId: string
}

export type MicrosoftCalendarSyncResult = {
  destinationType: string
  destinationEmail: string | null
  isPrimary: boolean
  success: boolean
  id: string | null
  htmlLink: string | null
  error?: string
}

type ResolvedMicrosoftGroup = MicrosoftGroupResponse & {
  id: string
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
  generateTeamsLink?: boolean
}

const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
  'Group.ReadWrite.All',
].join(' ')

const MICROSOFT_APP_SCOPE = 'https://graph.microsoft.com/.default'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed || null
}

export function getMicrosoftCalendarAccountEmail(): string {
  return env.FACTORY_CAREERS_CALENDAR_EMAIL
}

function getConfiguredMicrosoftCalendarGroupId(): string | null {
  return env.FACTORY_CAREERS_CALENDAR_GROUP_ID?.trim() || null
}

function getMicrosoftConfig(): MicrosoftCalendarConfig | null {
  const clientId = env.MICROSOFT_CALENDAR_CLIENT_ID || env.AUTH_MICROSOFT_CLIENT_ID
  const clientSecret = env.MICROSOFT_CALENDAR_CLIENT_SECRET || env.AUTH_MICROSOFT_CLIENT_SECRET
  const tenantId = env.MICROSOFT_CALENDAR_TENANT_ID || env.AUTH_MICROSOFT_TENANT_ID || 'common'

  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, tenantId }
}

export function getMicrosoftCalendarAuthMode(): 'delegated' | 'application' {
  return env.MICROSOFT_CALENDAR_AUTH_MODE
}

export function isMicrosoftCalendarApplicationMode(): boolean {
  return getMicrosoftCalendarAuthMode() === 'application'
}

export function isMicrosoftCalendarConfigured(): boolean {
  return !!getMicrosoftConfig()
}

function getMicrosoftBaseUrl(): string {
  const baseUrl = env.BETTER_AUTH_URL
    || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '')
    || 'https://careers.thefactoryhq.com'
  return baseUrl.replace(/\/+$/, '')
}

function getRedirectUri(): string {
  return `${getMicrosoftBaseUrl()}/api/calendar/microsoft/callback`
}

function getAuthorizeUrl(): string {
  const config = getMicrosoftConfig()
  if (!config) throw new Error('Microsoft Calendar integration is not configured')
  return `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize`
}

function getTokenUrl(): string {
  const config = getMicrosoftConfig()
  if (!config) throw new Error('Microsoft Calendar integration is not configured')
  return `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`
}

function tokenBody(params: Record<string, string>, options: { includeRedirectUri?: boolean } = {}): URLSearchParams {
  const config = getMicrosoftConfig()
  if (!config) throw new Error('Microsoft Calendar integration is not configured')

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...params,
  })
  if (options.includeRedirectUri !== false) {
    body.set('redirect_uri', getRedirectUri())
  }
  return body
}

export function getMicrosoftAuthUrl(stateToken: string, loginHint?: string | null): string {
  const config = getMicrosoftConfig()
  if (!config) throw new Error('Microsoft Calendar integration is not configured')

  const url = new URL(getAuthorizeUrl())
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', getRedirectUri())
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', MICROSOFT_SCOPES)
  url.searchParams.set('state', stateToken)
  if (loginHint) url.searchParams.set('login_hint', loginHint)
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

export async function exchangeMicrosoftCodeForTokens(code: string): Promise<{
  accessToken: string
  refreshToken: string
  email: string | null
}> {
  const tokens = await $fetch<MicrosoftTokenResponse>(getTokenUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenBody({
      grant_type: 'authorization_code',
      code,
      scope: MICROSOFT_SCOPES,
    }),
  })

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain Microsoft OAuth tokens')
  }

  let email: string | null = null
  try {
    const me = await $fetch<MicrosoftUserResponse>('https://graph.microsoft.com/v1.0/me', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    })
    email = me.mail || me.userPrincipalName || null
  }
  catch {
    // Non-critical — email is for display only.
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    email,
  }
}

async function refreshMicrosoftAccessToken(userId: string, organizationId?: string | null): Promise<MicrosoftGraphContext | null> {
  const integration = await db.query.calendarIntegration.findFirst({
    where: organizationId
      ? and(eq(calendarIntegration.organizationId, organizationId), eq(calendarIntegration.provider, 'microsoft'))
      : and(eq(calendarIntegration.userId, userId), eq(calendarIntegration.provider, 'microsoft')),
  })

  if (!integration) return null

  const secret = env.BETTER_AUTH_SECRET
  if (!integration.refreshTokenEncrypted) {
    return null // App-only integrations don't have refresh tokens
  }
  const refreshToken = decrypt(integration.refreshTokenEncrypted, secret)
  if (!refreshToken) {
    logError('calendar.microsoft_refresh_token_decrypt_failed', {
      posthog_distinct_id: userId,
    })
    return null
  }

  try {
    const tokens = await $fetch<MicrosoftTokenResponse>(getTokenUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenBody({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: MICROSOFT_SCOPES,
      }),
    })

    if (!tokens.access_token) return null

    await db.update(calendarIntegration)
      .set({
        accessTokenEncrypted: encrypt(tokens.access_token, secret),
        ...(tokens.refresh_token
          ? { refreshTokenEncrypted: encrypt(tokens.refresh_token, secret) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(calendarIntegration.id, integration.id))

    return {
      accessToken: tokens.access_token,
      integrationId: integration.id,
      calendarId: integration.calendarId,
    }
  }
  catch (err) {
    logError('calendar.microsoft_token_refresh_failed', {
      posthog_distinct_id: userId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

async function microsoftGraphFetchWithAccessToken<T>(
  accessToken: string,
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
  } = {},
): Promise<T> {
  const response = await $fetch<T>(`https://graph.microsoft.com/v1.0${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    ...(init.body ? { body: init.body } : {}),
  })
  return response as T
}

async function getMicrosoftApplicationAccessToken(): Promise<string> {
  const tokens = await $fetch<MicrosoftTokenResponse>(getTokenUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenBody({
      grant_type: 'client_credentials',
      scope: MICROSOFT_APP_SCOPE,
    }, { includeRedirectUri: false }),
  })

  if (!tokens.access_token) {
    throw new Error('Failed to obtain Microsoft application access token')
  }

  return tokens.access_token
}

function escapeODataString(value: string): string {
  return value.replaceAll("'", "''")
}

async function resolveMicrosoftCalendarGroup(accessToken: string): Promise<ResolvedMicrosoftGroup> {
  const configuredGroupId = getConfiguredMicrosoftCalendarGroupId()
  const calendarEmail = normalizeEmail(getMicrosoftCalendarAccountEmail())

  if (configuredGroupId) {
    try {
      const group = await microsoftGraphFetchWithAccessToken<MicrosoftGroupResponse>(
        accessToken,
        `/groups/${encodeURIComponent(configuredGroupId)}?$select=id,displayName,mail`,
      )
      if (group.id) return { ...group, id: group.id }
    }
    catch {
      throw new Error(`Microsoft Calendar group ${calendarEmail || configuredGroupId} was not found or is not accessible`)
    }
  }

  if (!calendarEmail) {
    throw new Error('Microsoft Calendar group email is not configured')
  }

  const url = new URL('https://graph.microsoft.com/v1.0/groups')
  url.searchParams.set('$select', 'id,displayName,mail')
  url.searchParams.set('$filter', `mail eq '${escapeODataString(calendarEmail)}'`)

  let groups: MicrosoftGroupListResponse
  try {
    groups = await $fetch<MicrosoftGroupListResponse>(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    })
  }
  catch {
    throw new Error(`Microsoft Calendar group ${calendarEmail} was not found or is not accessible`)
  }
  const group = groups.value?.find(item => normalizeEmail(item.mail) === calendarEmail) || groups.value?.[0]

  if (!group?.id) {
    throw new Error(`Microsoft Calendar group ${calendarEmail} was not found or is not accessible`)
  }

  return { ...group, id: group.id }
}

async function graphFetchGroupCalendar<T>(
  userId: string,
  organizationId: string | null | undefined,
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
  } = {},
): Promise<T> {
  const context = await refreshMicrosoftAccessToken(userId, organizationId)
  if (!context) throw new Error('Microsoft Calendar is not connected')

  let groupId = context.calendarId !== 'primary' ? context.calendarId : null
  if (!groupId) {
    const group = await resolveMicrosoftCalendarGroup(context.accessToken)
    groupId = group.id
    await db.update(calendarIntegration)
      .set({
        calendarId: group.id,
        updatedAt: new Date(),
      })
      .where(eq(calendarIntegration.id, context.integrationId))
  }

  return await microsoftGraphFetchWithAccessToken<T>(
    context.accessToken,
    `/groups/${encodeURIComponent(groupId)}/calendar${path}`,
    init,
  )
}

async function graphFetchMailboxCalendar<T>(
  accessToken: string,
  mailboxEmail: string,
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
  } = {},
): Promise<T> {
  return await microsoftGraphFetchWithAccessToken<T>(
    accessToken,
    `/users/${encodeURIComponent(mailboxEmail)}/calendar${path}`,
    init,
  )
}

function toGraphUtcDateTime(date: Date): string {
  return date.toISOString().replace(/Z$/, '')
}

function buildMicrosoftEventBody(
  data: Partial<InterviewEventData>,
  options: { includeAttendees?: boolean } = {},
) {
  const body: Record<string, unknown> = {}

  if (data.title) body.subject = data.title
  if (data.description) {
    body.body = {
      contentType: 'Text',
      content: data.description,
    }
  }
  if (data.location !== undefined) {
    body.location = {
      displayName: data.location || '',
    }
  }
  if (data.startTime && data.durationMinutes) {
    const endTime = new Date(data.startTime.getTime() + data.durationMinutes * 60_000)
    body.start = {
      dateTime: toGraphUtcDateTime(data.startTime),
      timeZone: 'UTC',
    }
    body.end = {
      dateTime: toGraphUtcDateTime(endTime),
      timeZone: 'UTC',
    }
  }

  if (options.includeAttendees !== false && (data.candidateEmail !== undefined || data.interviewerEmails !== undefined)) {
    const candidateEmailTrimmed = data.candidateEmail?.trim() || null
    const validInterviewerEmails = (data.interviewerEmails ?? [])
      .map(e => e.trim())
      .filter(e => isValidEmail(e))

    body.attendees = [
      ...(candidateEmailTrimmed && isValidEmail(candidateEmailTrimmed)
        ? [{
            emailAddress: {
              address: candidateEmailTrimmed,
              name: data.candidateName || candidateEmailTrimmed,
            },
            type: 'required',
          }]
        : []),
      ...validInterviewerEmails.map(email => ({
        emailAddress: { address: email, name: email },
        type: 'required',
      })),
    ]
  }

  // Generate Teams meeting link when requested (works in app mode)
  if (data.generateTeamsLink) {
    body.isOnlineMeeting = true
    body.onlineMeetingProvider = 'teamsForBusiness'
  }

  return body
}

async function getMicrosoftCalendarDestinations(organizationId: string | null | undefined, interviewerEmails: string[] = []): Promise<CalendarDestination[]> {
  let syncInterviewers = env.FACTORY_CAREERS_CALENDAR_SYNC_INTERVIEWERS

  if (organizationId && isMicrosoftCalendarApplicationMode()) {
    try {
      const setting = await db.query.orgSettings.findFirst({
        where: eq(orgSettings.organizationId, organizationId),
      })
      if (setting && typeof setting.calendarSyncInterviewers === 'boolean') {
        syncInterviewers = setting.calendarSyncInterviewers
      }
    } catch {
      // fall back to env
    }
  }

  return resolveMicrosoftCalendarDestinations({
    sharedCalendarEmail: getMicrosoftCalendarAccountEmail(),
    syncSharedCalendar: env.FACTORY_CAREERS_CALENDAR_SYNC_SHARED,
    configuredUserEmails: env.FACTORY_CAREERS_CALENDAR_USER_EMAILS,
    syncInterviewers,
    interviewerEmails,
    allowedDomains: env.FACTORY_ALLOWED_EMAIL_DOMAINS,
  })
}

export async function getMicrosoftCalendarDestinationSummary(organizationId?: string | null): Promise<{
  authMode: 'delegated' | 'application'
  destinations: CalendarDestination[]
  syncInterviewers: boolean
}> {
  let syncInterviewers = env.FACTORY_CAREERS_CALENDAR_SYNC_INTERVIEWERS

  if (organizationId && isMicrosoftCalendarApplicationMode()) {
    try {
      const setting = await db.query.orgSettings.findFirst({
        where: eq(orgSettings.organizationId, organizationId),
      })
      if (setting && typeof setting.calendarSyncInterviewers === 'boolean') {
        syncInterviewers = setting.calendarSyncInterviewers
      }
    } catch {
      // fall back to env
    }
  }

  return {
    authMode: getMicrosoftCalendarAuthMode(),
    destinations: isMicrosoftCalendarApplicationMode()
      ? await getMicrosoftCalendarDestinations(organizationId)
      : [],
    syncInterviewers,
  }
}

export async function saveMicrosoftCalendarIntegration(userId: string, organizationId: string, params: {
  accessToken: string
  refreshToken: string
  email: string | null
}): Promise<void> {
  const secret = env.BETTER_AUTH_SECRET
  const group = await resolveMicrosoftCalendarGroup(params.accessToken)

  await db.delete(calendarIntegration)
    .where(and(eq(calendarIntegration.organizationId, organizationId), eq(calendarIntegration.provider, 'microsoft')))
  await db.delete(calendarIntegration)
    .where(and(eq(calendarIntegration.userId, userId), eq(calendarIntegration.provider, 'microsoft')))
  await db.insert(calendarIntegration).values({
    userId,
    organizationId,
    provider: 'microsoft',
    accessTokenEncrypted: encrypt(params.accessToken, secret),
    refreshTokenEncrypted: encrypt(params.refreshToken, secret),
    calendarId: group.id,
    accountEmail: normalizeEmail(params.email) || params.email,
  })
}

export async function removeMicrosoftCalendarIntegration(userId: string, organizationId?: string | null): Promise<void> {
  await db.delete(calendarIntegration)
    .where(organizationId
      ? and(eq(calendarIntegration.organizationId, organizationId), eq(calendarIntegration.provider, 'microsoft'))
      : and(eq(calendarIntegration.userId, userId), eq(calendarIntegration.provider, 'microsoft')))
}

/**
 * Enable Microsoft Calendar integration at the organization level using application (app-only) permissions.
 * This is used when MICROSOFT_CALENDAR_AUTH_MODE=application.
 * No user tokens are stored; the system uses client_credentials from the pre-configured app registration.
 */
export async function enableMicrosoftCalendarAppIntegration(organizationId: string): Promise<void> {
  const secret = env.BETTER_AUTH_SECRET

  // Obtain an app token to resolve the target calendar/group
  let accessToken: string
  try {
    accessToken = await getMicrosoftApplicationAccessToken()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to obtain app token for Microsoft Calendar: ${message}`)
  }

  const group = await resolveMicrosoftCalendarGroup(accessToken)
  const expectedEmail = getMicrosoftCalendarAccountEmail()

  await db.delete(calendarIntegration)
    .where(and(eq(calendarIntegration.organizationId, organizationId), eq(calendarIntegration.provider, 'microsoft')))

  await db.insert(calendarIntegration).values({
    userId: null, // organization-level / app-only
    organizationId,
    provider: 'microsoft',
    accessTokenEncrypted: null,
    refreshTokenEncrypted: null,
    calendarId: group.id,
    accountEmail: normalizeEmail(expectedEmail) || expectedEmail,
  })
}

export async function createMicrosoftCalendarEvent(
  userId: string,
  organizationId: string | null | undefined,
  data: InterviewEventData,
): Promise<{ id: string; htmlLink: string } | null> {
  try {
    const event = await graphFetchGroupCalendar<MicrosoftEventResponse>(userId, organizationId, '/events', {
      method: 'POST',
      body: {
        ...buildMicrosoftEventBody(data),
        isReminderOn: true,
        reminderMinutesBeforeStart: 15,
        showAs: 'busy',
      },
    })

    if (!event.id || !event.webLink) return null
    return { id: event.id, htmlLink: event.webLink }
  }
  catch (err) {
    logError('calendar.microsoft_create_event_failed', {
      posthog_distinct_id: userId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export async function createMicrosoftCalendarEvents(
  userId: string,
  organizationId: string | null | undefined,
  data: InterviewEventData,
): Promise<MicrosoftCalendarSyncResult[]> {
  if (!isMicrosoftCalendarApplicationMode()) {
    const event = await createMicrosoftCalendarEvent(userId, organizationId, data)
    return event
      ? [{
          destinationType: 'connected_calendar',
          destinationEmail: null,
          isPrimary: true,
          success: true,
          id: event.id,
          htmlLink: event.htmlLink,
        }]
      : []
  }

  const destinations = await getMicrosoftCalendarDestinations(organizationId, data.interviewerEmails)
  if (destinations.length === 0) {
    logWarn('calendar.microsoft_no_destinations_configured', {
      posthog_distinct_id: userId,
      org_id: organizationId ?? undefined,
    })
    return []
  }

  let accessToken: string
  try {
    accessToken = await getMicrosoftApplicationAccessToken()
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logError('calendar.microsoft_app_token_failed', {
      posthog_distinct_id: userId,
      org_id: organizationId ?? undefined,
      error_message: message,
    })
    return destinations.map(destination => ({
      destinationType: destination.type,
      destinationEmail: destination.email,
      isPrimary: destination.isPrimary,
      success: false,
      id: null,
      htmlLink: null,
      error: message,
    }))
  }

  return await Promise.all(destinations.map(async (destination) => {
    try {
      const event = await graphFetchMailboxCalendar<MicrosoftEventResponse>(accessToken, destination.email, '/events', {
        method: 'POST',
        body: {
          ...buildMicrosoftEventBody(data, { includeAttendees: destination.isPrimary }),
          isReminderOn: true,
          reminderMinutesBeforeStart: 15,
          showAs: 'busy',
        },
      })

      if (!event.id || !event.webLink) {
        throw new Error('Microsoft Graph did not return an event ID or event link')
      }

      return {
        destinationType: destination.type,
        destinationEmail: destination.email,
        isPrimary: destination.isPrimary,
        success: true,
        id: event.id,
        htmlLink: event.webLink,
      }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logError('calendar.microsoft_create_mailbox_event_failed', {
        posthog_distinct_id: userId,
        org_id: organizationId ?? undefined,
        destination_email: destination.email,
        destination_type: destination.type,
        error_message: message,
      })
      return {
        destinationType: destination.type,
        destinationEmail: destination.email,
        isPrimary: destination.isPrimary,
        success: false,
        id: null,
        htmlLink: null,
        error: message,
      }
    }
  }))
}

export async function updateMicrosoftCalendarEvent(
  userId: string,
  organizationId: string | null | undefined,
  eventId: string,
  data: Partial<InterviewEventData>,
): Promise<string | null> {
  try {
    const event = await graphFetchGroupCalendar<MicrosoftEventResponse>(
      userId,
      organizationId,
      `/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        body: buildMicrosoftEventBody(data),
      },
    )
    return event.webLink ?? null
  }
  catch (err) {
    logError('calendar.microsoft_update_event_failed', {
      posthog_distinct_id: userId,
      event_id: eventId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export async function updateMicrosoftMailboxCalendarEvent(
  userId: string,
  destinationEmail: string,
  eventId: string,
  isPrimary: boolean,
  data: Partial<InterviewEventData>,
): Promise<string | null> {
  try {
    const accessToken = await getMicrosoftApplicationAccessToken()
    const event = await graphFetchMailboxCalendar<MicrosoftEventResponse>(
      accessToken,
      destinationEmail,
      `/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        body: buildMicrosoftEventBody(data, { includeAttendees: isPrimary }),
      },
    )
    return event.webLink ?? null
  }
  catch (err) {
    logError('calendar.microsoft_update_mailbox_event_failed', {
      posthog_distinct_id: userId,
      destination_email: destinationEmail,
      event_id: eventId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export async function cancelMicrosoftCalendarEvent(
  userId: string,
  organizationId: string | null | undefined,
  eventId: string,
): Promise<boolean> {
  try {
    await graphFetchGroupCalendar<void>(userId, organizationId, `/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    })
    return true
  }
  catch (err) {
    logError('calendar.microsoft_cancel_event_failed', {
      posthog_distinct_id: userId,
      event_id: eventId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

export async function cancelMicrosoftMailboxCalendarEvent(
  userId: string,
  destinationEmail: string,
  eventId: string,
): Promise<boolean> {
  try {
    const accessToken = await getMicrosoftApplicationAccessToken()
    await graphFetchMailboxCalendar<void>(accessToken, destinationEmail, `/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    })
    return true
  }
  catch (err) {
    logError('calendar.microsoft_cancel_mailbox_event_failed', {
      posthog_distinct_id: userId,
      destination_email: destinationEmail,
      event_id: eventId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
