import { eq, and } from 'drizzle-orm'
import { privacyRequest } from '../../database/schema'
import { sendPrivacyRequestInternalAlertEmail, sendPrivacyRequestVerificationEmail } from '../../utils/email'
import { readPositiveIntegerEnv } from '../../utils/rateLimitConfig'
import { createPrivacyRequestSchema } from '../../utils/schemas/privacyRequest'
import {
  buildPrivacyRequestPublicResponse,
  generatePrivacyRequestToken,
  hashPrivacyRequestToken,
  resolvePrivacyRequestOrganizationId,
} from '../../utils/privacyRequests'

const PRIVACY_REQUEST_RATE_LIMIT_WINDOW_MS = readPositiveIntegerEnv(
  'PRIVACY_REQUEST_RATE_LIMIT_WINDOW_MS',
  60 * 60 * 1000,
)
const PRIVACY_REQUEST_RATE_LIMIT_MAX_REQUESTS = readPositiveIntegerEnv(
  'PRIVACY_REQUEST_RATE_LIMIT_MAX_REQUESTS',
  3,
)

const ipLimiter = createRateLimiter({
  windowMs: PRIVACY_REQUEST_RATE_LIMIT_WINDOW_MS,
  maxRequests: PRIVACY_REQUEST_RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many privacy requests. Please try again later.',
})
const emailSubmissions = new Map<string, number[]>()

function pruneEmailSubmissions(now: number) {
  for (const [email, timestamps] of emailSubmissions) {
    const active = timestamps.filter((timestamp) => now - timestamp < PRIVACY_REQUEST_RATE_LIMIT_WINDOW_MS)
    if (active.length === 0) emailSubmissions.delete(email)
    else emailSubmissions.set(email, active)
  }
}

function enforceEmailRateLimit(email: string) {
  const now = Date.now()
  pruneEmailSubmissions(now)
  const active = emailSubmissions.get(email) ?? []
  if (active.length >= PRIVACY_REQUEST_RATE_LIMIT_MAX_REQUESTS) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many privacy requests. Please try again later.',
    })
  }
  active.push(now)
  emailSubmissions.set(email, active)
}

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    await ipLimiter(event)
  }

  const body = await readValidatedBody(event, createPrivacyRequestSchema.parse)
  const publicResponse = buildPrivacyRequestPublicResponse()

  if (body.website) {
    return publicResponse
  }

  if (process.env.NODE_ENV === 'production') {
    enforceEmailRateLimit(body.requesterEmail)
  }

  const organizationId = await resolvePrivacyRequestOrganizationId({
    jobSlug: body.jobSlug,
    applicationId: body.applicationId,
  })
  const verificationToken = generatePrivacyRequestToken()
  const verificationTokenHash = hashPrivacyRequestToken(verificationToken)
  const details = [
    body.requestContext ? `Role or application context: ${body.requestContext}` : null,
    body.details,
  ].filter(Boolean).join('\n\n') || null

  const [created] = await db.insert(privacyRequest).values({
    organizationId,
    requesterName: body.requesterName,
    requesterEmail: body.requesterEmail,
    stateOfResidence: body.stateOfResidence,
    jobSlug: body.jobSlug ?? null,
    applicationId: body.applicationId ?? null,
    details,
    verificationTokenHash,
  }).returning({
    id: privacyRequest.id,
    requesterName: privacyRequest.requesterName,
    requesterEmail: privacyRequest.requesterEmail,
    stateOfResidence: privacyRequest.stateOfResidence,
  })

  const url = getRequestURL(event)
  const verifyUrl = `${url.origin}/api/privacy-requests/verify?token=${encodeURIComponent(verificationToken)}`
  const dashboardUrl = `${url.origin}/dashboard/settings/privacy-requests`

  void sendPrivacyRequestVerificationEmail({
    requesterName: created!.requesterName,
    requesterEmail: created!.requesterEmail,
    verifyUrl,
  })
  void sendPrivacyRequestInternalAlertEmail({
    requesterName: created!.requesterName,
    requesterEmail: created!.requesterEmail,
    stateOfResidence: created!.stateOfResidence,
    dashboardUrl,
  })

  // Avoid revealing whether this requester email already has an open request.
  await db.query.privacyRequest.findFirst({
    where: and(
      eq(privacyRequest.requesterEmail, body.requesterEmail),
      eq(privacyRequest.verificationTokenHash, verificationTokenHash),
    ),
    columns: { id: true },
  })

  setResponseStatus(event, 202)
  return publicResponse
})
