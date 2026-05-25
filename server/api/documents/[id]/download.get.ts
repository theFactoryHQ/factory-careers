import {
  getDocumentIdParam,
  loadOrgDocumentForRead,
  streamS3Document,
} from '../../../utils/documentStreaming'

/**
 * GET /api/documents/:id/download
 *
 * Stream a document directly through the server for authenticated download.
 * The file bytes are proxied from S3/MinIO so presigned URLs are never
 * exposed to the client — eliminates the risk of URL sharing/leaking.
 *
 * Security:
 *   - Auth required, org-scoped
 *   - Document must belong to the authenticated org (prevents IDOR)
 *   - Returns 404 for non-existent or cross-org documents (no information leak)
 *   - Content-Disposition: attachment forces download (prevents inline rendering)
 *   - No presigned URLs — S3 credentials never leave the server
 *   - Cache-Control: no-store prevents caching of sensitive documents
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { document: ['read'] })
  const orgId = session.session.activeOrganizationId

  const documentId = await getDocumentIdParam(event)
  const doc = await loadOrgDocumentForRead(orgId, documentId)

  return streamS3Document(event, doc, { disposition: 'attachment' })
})
