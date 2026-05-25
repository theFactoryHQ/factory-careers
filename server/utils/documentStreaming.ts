import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import type { H3Event } from 'h3'
import { document } from '../database/schema'

const documentIdParamSchema = z.object({ id: z.string().uuid() })

export type ReadableDocument = {
  storageKey: string
  originalFilename: string
  mimeType: string
}

export async function getDocumentIdParam(event: H3Event): Promise<string> {
  const { id } = await getValidatedRouterParams(event, documentIdParamSchema.parse)
  return id
}

export async function loadOrgDocumentForRead(orgId: string, documentId: string): Promise<ReadableDocument> {
  const doc = await db.query.document.findFirst({
    where: and(
      eq(document.id, documentId),
      eq(document.organizationId, orgId),
    ),
    columns: {
      storageKey: true,
      originalFilename: true,
      mimeType: true,
    },
  })

  if (!doc) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  }

  return doc
}

export function buildDocumentStreamHeaders(opts: {
  filename: string
  contentType: string
  disposition: 'attachment' | 'inline'
  contentLength?: number
  frameOptions?: string
  contentSecurityPolicy?: string
}): Record<string, string> {
  const encodedFilename = encodeURIComponent(opts.filename)
  const headers: Record<string, string> = {
    'Content-Type': opts.contentType,
    // RFC 5987: ASCII fallback + UTF-8 extended filename for international characters
    'Content-Disposition': `${opts.disposition}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }

  if (opts.contentLength) {
    headers['Content-Length'] = String(opts.contentLength)
  }
  if (opts.frameOptions) {
    headers['X-Frame-Options'] = opts.frameOptions
  }
  if (opts.contentSecurityPolicy) {
    headers['Content-Security-Policy'] = opts.contentSecurityPolicy
  }

  return headers
}

export async function streamS3Document(event: H3Event, doc: ReadableDocument, opts: {
  disposition: 'attachment' | 'inline'
  contentType?: string
  frameOptions?: string
  contentSecurityPolicy?: string
}): Promise<ReadableStream> {
  const s3Response = await s3Client.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: doc.storageKey,
    }),
  )

  if (!s3Response.Body) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to retrieve document' })
  }

  setResponseHeaders(event, buildDocumentStreamHeaders({
    filename: doc.originalFilename,
    contentType: opts.contentType ?? doc.mimeType,
    disposition: opts.disposition,
    contentLength: s3Response.ContentLength,
    frameOptions: opts.frameOptions,
    contentSecurityPolicy: opts.contentSecurityPolicy,
  }))

  return s3Response.Body.transformToWebStream()
}
