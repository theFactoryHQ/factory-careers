import { and, eq, inArray } from 'drizzle-orm'
import { candidate, privacyRequest } from '../../../database/schema'
import {
  canAccessPrivacyRequestForOrg,
  deleteCandidatePersonalDataForPrivacyRequest,
} from '../../../utils/privacyRequests'
import { fulfillPrivacyRequestSchema, privacyRequestIdParamSchema } from '../../../utils/schemas/privacyRequest'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { privacyRequest: ['read', 'update'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, privacyRequestIdParamSchema.parse)
  const body = await readValidatedBody(event, fulfillPrivacyRequestSchema.parse)

  await db.query.privacyRequest.findFirst({
    where: eq(privacyRequest.organizationId, orgId),
    columns: { id: true },
  })

  const request = await canAccessPrivacyRequestForOrg({
    requestId: id,
    organizationId: orgId,
  })

  if (!request) {
    throw createError({ statusCode: 404, statusMessage: 'Privacy request not found' })
  }
  if (!request.verifiedAt) {
    throw createError({ statusCode: 409, statusMessage: 'Privacy request must be verified before fulfillment' })
  }
  if (request.status === 'completed') {
    throw createError({ statusCode: 409, statusMessage: 'Privacy request is already completed' })
  }

  const matchingCandidates = await db.query.candidate.findMany({
    where: and(
      eq(candidate.organizationId, orgId),
      eq(candidate.email, request.requesterEmail),
      inArray(candidate.id, body.candidateIds),
    ),
    columns: { id: true },
  })

  if (matchingCandidates.length !== body.candidateIds.length) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Selected candidates must match the verified requester email and active organization',
    })
  }

  const result = await deleteCandidatePersonalDataForPrivacyRequest({
    organizationId: orgId,
    candidateIds: body.candidateIds,
    actorId: session.user.id,
    privacyRequestId: request.id,
  })

  const now = new Date()
  const [updated] = await db.update(privacyRequest)
    .set({
      organizationId: request.organizationId ?? orgId,
      status: 'completed',
      reviewedById: request.reviewedById ?? session.user.id,
      reviewedAt: request.reviewedAt ?? now,
      completedById: session.user.id,
      completedAt: now,
      resolutionNotes: body.resolutionNotes ?? request.resolutionNotes,
      updatedAt: now,
    })
    .where(eq(privacyRequest.id, request.id))
    .returning()

  return { request: updated, result }
})
