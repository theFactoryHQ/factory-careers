import { eq, and } from 'drizzle-orm'
import { candidate, document } from '../../database/schema'
import { candidateIdParamSchema } from '../../utils/schemas/candidate'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { candidate: ['delete'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, candidateIdParamSchema.parse)

  const documentsToDelete = await db.query.document.findMany({
    where: and(
      eq(document.candidateId, id),
      eq(document.organizationId, orgId),
    ),
    columns: {
      id: true,
      storageKey: true,
    },
  })

  const [deleted] = await db.delete(candidate)
    .where(and(eq(candidate.id, id), eq(candidate.organizationId, orgId)))
    .returning({ id: candidate.id })

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  for (const doc of documentsToDelete) {
    try {
      await deleteFromS3(doc.storageKey)
    } catch (s3Error) {
      logWarn('candidate.document_s3_delete_failed', {
        candidate_id: id,
        document_id: doc.id,
        storage_key: doc.storageKey,
        error_message: s3Error instanceof Error ? s3Error.message : String(s3Error),
      })
    }
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'candidate',
    resourceId: id,
    metadata: { deletedDocumentCount: documentsToDelete.length },
  })

  setResponseStatus(event, 204)
  return null
})
