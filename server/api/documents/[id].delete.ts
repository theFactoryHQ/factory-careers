import { uuidParamSchema } from '../../utils/schemas/common'
import { deleteDocumentWithProcessingHistory } from '../../utils/documentDeletion'

/**
 * DELETE /api/documents/:id
 *
 * Cancel active processing, delete the database row, then remove storage.
 *
 * Security:
 *   - Auth required, org-scoped
 *   - Document must belong to the authenticated org (prevents IDOR)
 *   - Returns 404 for non-existent or cross-org documents
 *   - Durable processing history is retained as cancelled
 *   - S3 deletion happens only after the relational transaction commits
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { document: ['delete'] })
  const orgId = session.session.activeOrganizationId

  const { id: documentId } = await getValidatedRouterParams(event, uuidParamSchema.parse)

  const doc = await deleteDocumentWithProcessingHistory({
    organizationId: orgId,
    documentId,
  })

  if (!doc) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'document',
    resourceId: doc.id,
  })

  setResponseStatus(event, 204)
  return null
})
