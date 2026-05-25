import {
  getDocumentIdParam,
  loadOrgDocumentForRead,
  streamS3Document,
} from '../../../utils/documentStreaming'

/**
 * GET /api/documents/:id/preview
 *
 * Stream a PDF document directly through the server for inline preview.
 * The PDF bytes are proxied from S3/MinIO so the iframe loads from the
 * same origin — eliminates cross-origin issues with presigned URLs.
 *
 * Security:
 *   - Auth required, org-scoped
 *   - Document must belong to the authenticated org (prevents IDOR)
 *   - Returns 404 for non-existent or cross-org documents (no information leak)
 *   - Only PDFs allowed for inline preview (DOC/DOCX can contain macros)
 *   - Content-Type forced to application/pdf to prevent MIME confusion
 *   - Content-Disposition: inline allows browser rendering
 *   - X-Frame-Options overridden to SAMEORIGIN for this route only
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { document: ['read'] })
  const orgId = session.session.activeOrganizationId

  const documentId = await getDocumentIdParam(event)
  const doc = await loadOrgDocumentForRead(orgId, documentId)

  // Only allow inline preview for PDFs — DOC/DOCX can contain macros
  if (doc.mimeType !== 'application/pdf') {
    throw createError({
      statusCode: 415,
      statusMessage: 'Inline preview is only available for PDF files',
    })
  }

  return streamS3Document(event, doc, {
    disposition: 'inline',
    contentType: 'application/pdf',
    // Override global DENY — allow same-origin framing for preview iframe
    frameOptions: 'SAMEORIGIN',
    // Restrictive CSP — prevent a malicious PDF from loading external resources
    contentSecurityPolicy: "default-src 'none'; style-src 'unsafe-inline'",
  })
})
