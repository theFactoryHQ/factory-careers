import { eq, and } from 'drizzle-orm'
import { uuidParamSchema } from '../../../../utils/schemas/common'
import { candidate } from '../../../../database/schema'
import {
  MAX_FILE_SIZE,
  MAX_DOCUMENTS_PER_CANDIDATE,
  MIME_TO_EXTENSION,
  documentTypeSchema,
  sanitizeFilename,
} from '../../../../utils/schemas/document'
import {
  DEFAULT_DOCUMENT_PARSE_TIMEOUT_MS,
  DocumentParseError,
  parseDocumentDetailed,
} from '../../../../utils/resume-parser'
import { parseFailurePersistence, parseResultPersistence } from '../../../../utils/documentParseOutcome'
import { enqueueProcessingTask } from '../../../../utils/processingQueue'
import { assertUploadContentLength } from '../../../../utils/uploadLimits'
import { detectAllowedDocumentMimeType } from '../../../../utils/documentMime'
import {
  CandidateDocumentLimitError,
  finalizeCandidateDocumentUpload,
  reserveCandidateDocument,
  rollbackCandidateDocumentUpload,
  type ReservedCandidateDocument,
} from '../../../../utils/candidateDocumentReservation'

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024
const MAX_DOCUMENT_UPLOAD_BODY_BYTES = MAX_FILE_SIZE + MULTIPART_OVERHEAD_BYTES

/**
 * POST /api/candidates/:id/documents
 *
 * Upload a document (resume, cover letter, etc.) for a candidate.
 * Accepts multipart/form-data with:
 *   - `file`: the document file (PDF, DOC, DOCX — max 10 MB)
 *   - `type`: document type ("resume" | "cover_letter" | "other")
 *
 * Security:
 *   - Auth required, org-scoped
 *   - Candidate ownership verified (candidate must belong to the authenticated org)
 *   - MIME type validated from file magic bytes (not just Content-Type header)
 *   - Storage key is server-generated (no user-controlled path components)
 *   - Per-candidate document limit enforced
 *   - Document capacity is reserved under a candidate-scoped transaction lock
 *   - Relational reservations are removed before best-effort S3 compensation
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { document: ['create'] })
  const orgId = session.session.activeOrganizationId

  // ─────────────────────────────────────────────
  // 1. Validate candidate exists and belongs to this org
  // ─────────────────────────────────────────────

  const { id: candidateId } = await getValidatedRouterParams(event, uuidParamSchema.parse)

  const existingCandidate = await db.query.candidate.findFirst({
    where: and(
      eq(candidate.id, candidateId),
      eq(candidate.organizationId, orgId),
    ),
    columns: { id: true },
  })

  if (!existingCandidate) {
    throw createError({ statusCode: 404, statusMessage: 'Candidate not found' })
  }

  // ─────────────────────────────────────────────
  // 2. Read multipart form data
  // ─────────────────────────────────────────────

  assertUploadContentLength(event, MAX_DOCUMENT_UPLOAD_BODY_BYTES)

  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'No form data received' })
  }

  const filePart = formData.find((part) => part.name === 'file')
  const typePart = formData.find((part) => part.name === 'type')

  if (!filePart || !filePart.data || !filePart.filename) {
    throw createError({ statusCode: 400, statusMessage: 'No file provided' })
  }

  // ─────────────────────────────────────────────
  // 3. Validate document type
  // ─────────────────────────────────────────────

  const typeValue = typePart?.data?.toString() ?? 'resume'
  const typeResult = documentTypeSchema.safeParse(typeValue)
  if (!typeResult.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid document type. Must be: resume, cover_letter, or other' })
  }
  const documentType = typeResult.data

  // ─────────────────────────────────────────────
  // 4. Validate file size
  // ─────────────────────────────────────────────

  const fileBuffer = filePart.data
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 413,
      statusMessage: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB`,
    })
  }

  // ─────────────────────────────────────────────
  // 5. Validate MIME type from magic bytes (not just Content-Type header)
  // ─────────────────────────────────────────────

  const mimeType = await detectAllowedDocumentMimeType(fileBuffer)
  if (!mimeType) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid file type. Allowed: PDF, DOC, DOCX',
    })
  }

  // ─────────────────────────────────────────────
  // 6. Reserve capacity and a document row before touching storage
  // ─────────────────────────────────────────────

  const documentId = crypto.randomUUID()
  const extension = MIME_TO_EXTENSION[mimeType] ?? 'bin'
  const storageKey = `${orgId}/${candidateId}/${documentId}.${extension}`

  let reservedDocument: ReservedCandidateDocument
  try {
    reservedDocument = await reserveCandidateDocument({
      id: documentId,
      organizationId: orgId,
      candidateId,
      type: documentType,
      storageKey,
      originalFilename: sanitizeFilename(filePart.filename),
      mimeType,
      sizeBytes: fileBuffer.length,
      maxDocumentsPerCandidate: MAX_DOCUMENTS_PER_CANDIDATE,
    })
  } catch (reservationError) {
    if (reservationError instanceof CandidateDocumentLimitError) {
      throw createError({ statusCode: 409, statusMessage: reservationError.message })
    }
    throw reservationError
  }

  // ─────────────────────────────────────────────
  // 7. Upload and parse, then finalize the reserved row
  // ─────────────────────────────────────────────

  try {
    await uploadToS3(storageKey, fileBuffer, mimeType)
  } catch (uploadError) {
    const rollback = await rollbackCandidateDocumentUpload({
      documentId,
      organizationId: orgId,
      candidateId,
      storageKey,
    })
    if (!rollback.relationalCleanupSucceeded) {
      throw createError({
        statusCode: 500,
        statusMessage: 'The document record was created, but its upload could not be completed. Please contact support before retrying.',
      })
    }

    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to upload the document. Please try again.',
      cause: uploadError,
    })
  }

  const attemptedAt = new Date()
  let parsePersistence
  try {
    parsePersistence = parseResultPersistence(
      await parseDocumentDetailed(
        fileBuffer,
        mimeType,
        { timeoutMs: DEFAULT_DOCUMENT_PARSE_TIMEOUT_MS },
      ),
      attemptedAt,
    )
  } catch (error) {
    const parseError = error instanceof DocumentParseError
      ? error
      : new DocumentParseError('parser_runtime_error', true, error)
    parsePersistence = parseFailurePersistence(parseError, false, attemptedAt)
    if (parseError.retryable) {
      // Follow-on work is enqueued before upload finalization and never from a
      // task-completion callback, preserving the global queue lock order.
      await enqueueProcessingTask({
        organizationId: orgId,
        type: 'document_parse',
        resourceId: reservedDocument.id,
      })
    }
  }

  const created = await finalizeCandidateDocumentUpload({
    documentId: reservedDocument.id,
    organizationId: orgId,
    candidateId,
    processingTaskId: reservedDocument.processingTaskId,
    ...parsePersistence,
  })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'created',
    resourceType: 'document',
    resourceId: created.id,
    metadata: { candidateId, filename: created.originalFilename, type: created.type },
  })

  setResponseStatus(event, 201)
  return created
})
