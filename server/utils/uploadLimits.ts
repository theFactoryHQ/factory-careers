import type { H3Event } from 'h3'

export function assertUploadContentLength(event: H3Event, maxBytes: number): void {
  const rawContentLength = getHeader(event, 'content-length')
  if (!rawContentLength) {
    throw createError({
      statusCode: 411,
      statusMessage: 'Content-Length header required for file uploads',
    })
  }

  const contentLength = Number(rawContentLength)
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Content-Length header',
    })
  }

  if (contentLength > maxBytes) {
    throw createError({
      statusCode: 413,
      statusMessage: `Request body too large. Maximum size is ${Math.floor(maxBytes / 1024 / 1024)} MB`,
    })
  }
}
