import { canAccessPrivacyRequestForOrg, findPrivacyRequestCandidateMatches } from '../../utils/privacyRequests'
import { privacyRequestIdParamSchema } from '../../utils/schemas/privacyRequest'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { privacyRequest: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, privacyRequestIdParamSchema.parse)

  const request = await canAccessPrivacyRequestForOrg({
    requestId: id,
    organizationId: orgId,
  })

  if (!request) {
    throw createError({ statusCode: 404, statusMessage: 'Privacy request not found' })
  }

  const matches = await findPrivacyRequestCandidateMatches({
    organizationId: orgId,
    requesterEmail: request.requesterEmail,
  })

  return { request, matches }
})
