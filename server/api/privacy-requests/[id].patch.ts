import { eq } from 'drizzle-orm'
import { privacyRequest } from '../../database/schema'
import { canAccessPrivacyRequestForOrg } from '../../utils/privacyRequests'
import { privacyRequestIdParamSchema, updatePrivacyRequestSchema } from '../../utils/schemas/privacyRequest'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { privacyRequest: ['read', 'update'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, privacyRequestIdParamSchema.parse)
  const body = await readValidatedBody(event, updatePrivacyRequestSchema.parse)

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

  const nextStatus = body.status ?? request.status
  const now = new Date()
  const [updated] = await db.update(privacyRequest)
    .set({
      status: nextStatus,
      organizationId: request.organizationId ?? orgId,
      reviewedById: session.user.id,
      reviewedAt: request.reviewedAt ?? now,
      resolutionNotes: body.resolutionNotes === undefined ? request.resolutionNotes : body.resolutionNotes,
      denialReason: body.denialReason === undefined ? request.denialReason : body.denialReason,
      updatedAt: now,
    })
    .where(eq(privacyRequest.id, request.id))
    .returning()

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'privacy_request',
    resourceId: request.id,
    metadata: { status: nextStatus },
  })

  return updated
})
