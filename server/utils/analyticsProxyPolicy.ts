const INGESTION_ORIGIN = 'https://eu.i.posthog.com'
const ASSETS_ORIGIN = 'https://eu-assets.i.posthog.com'

export const MAX_ANALYTICS_REQUEST_BYTES = 1024 * 1024
export const MAX_ANALYTICS_RESPONSE_BYTES = 2 * 1024 * 1024

const SAFE_STATIC_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/
const SAFE_PROJECT_TOKEN = /^[A-Za-z0-9_-]+$/

const FORWARDABLE_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'content-type',
  'origin',
  'referer',
  'user-agent',
])

const FORWARDABLE_RESPONSE_HEADERS = new Set([
  'cache-control',
  'content-language',
  'content-type',
  'etag',
  'expires',
  'last-modified',
  'vary',
])

export type AnalyticsRateLimitBucket = 'ingestion' | 'assets'

export interface AnalyticsProxyPolicy {
  family: 'capture' | 'flags' | 'static' | 'array-config'
  path: string
  method: 'GET' | 'HEAD' | 'POST'
  upstreamOrigin: typeof INGESTION_ORIGIN | typeof ASSETS_ORIGIN
  rateLimitBucket: AnalyticsRateLimitBucket
}

type HeaderSource = Headers | Record<string, string | string[] | undefined>

export interface AnalyticsProxyRequest {
  path: string
  method: string
  query: URLSearchParams
  headers: HeaderSource
  readBody: (maxBytes: number) => Promise<Uint8Array | undefined>
}

export interface AnalyticsProxyDependencies {
  fetch: (input: string, init: RequestInit) => Promise<Response>
  enforceRateLimit: (bucket: AnalyticsRateLimitBucket) => Promise<void>
}

export interface AnalyticsProxyResult {
  status: number
  statusText: string
  headers: Headers
  body: Uint8Array
}

export class AnalyticsProxyError extends Error {
  readonly statusCode: number
  readonly statusMessage: string

  constructor(statusCode: number, statusMessage: string, message = statusMessage) {
    super(message)
    this.name = 'AnalyticsProxyError'
    this.statusCode = statusCode
    this.statusMessage = statusMessage
  }
}

function rejectMethod(method: string): never {
  throw new AnalyticsProxyError(405, 'Method Not Allowed')
}

function requireMethod(method: string, allowed: readonly string[]): AnalyticsProxyPolicy['method'] {
  const normalizedMethod = method.toUpperCase()
  if (!allowed.includes(normalizedMethod)) rejectMethod(normalizedMethod)
  return normalizedMethod as AnalyticsProxyPolicy['method']
}

function isSafeStaticPath(path: string): boolean {
  const segments = path.slice('static/'.length).split('/')
  return segments.length > 0
    && segments.every(segment => SAFE_STATIC_SEGMENT.test(segment) && segment !== '.' && segment !== '..')
}

function isArrayConfigPath(path: string): boolean {
  const match = /^array\/([^/]+)\/(config(?:\.js)?)$/.exec(path)
  return Boolean(match && SAFE_PROJECT_TOKEN.test(match[1]!))
}

export function classifyAnalyticsProxyRequest(path: string, method: string): AnalyticsProxyPolicy {
  if (path === 'e' || path === 'e/') {
    return {
      family: 'capture',
      path,
      method: requireMethod(method, ['POST']),
      upstreamOrigin: INGESTION_ORIGIN,
      rateLimitBucket: 'ingestion',
    }
  }

  if (path === 'flags' || path === 'flags/') {
    return {
      family: 'flags',
      path,
      method: requireMethod(method, ['POST']),
      upstreamOrigin: INGESTION_ORIGIN,
      rateLimitBucket: 'ingestion',
    }
  }

  if (path.startsWith('static/')) {
    if (!isSafeStaticPath(path)) throw new AnalyticsProxyError(404, 'Not Found')
    return {
      family: 'static',
      path,
      method: requireMethod(method, ['GET', 'HEAD']),
      upstreamOrigin: ASSETS_ORIGIN,
      rateLimitBucket: 'assets',
    }
  }

  if (path.startsWith('array/')) {
    if (!isArrayConfigPath(path)) throw new AnalyticsProxyError(404, 'Not Found')
    return {
      family: 'array-config',
      path,
      method: requireMethod(method, ['GET', 'HEAD']),
      upstreamOrigin: ASSETS_ORIGIN,
      rateLimitBucket: 'assets',
    }
  }

  throw new AnalyticsProxyError(404, 'Not Found')
}

export function buildAnalyticsProxyTarget(policy: AnalyticsProxyPolicy, query: URLSearchParams): string {
  const target = new URL(`/${policy.path}`, policy.upstreamOrigin)
  target.search = new URLSearchParams(query).toString()
  return target.toString()
}

function headerEntries(source: HeaderSource): Array<[string, string]> {
  if (source instanceof Headers) return [...source.entries()]

  return Object.entries(source).flatMap(([name, value]) => {
    if (value === undefined) return []
    return [[name, Array.isArray(value) ? value.join(', ') : value]]
  })
}

function getHeader(source: HeaderSource, requestedName: string): string | undefined {
  const normalizedRequestedName = requestedName.toLowerCase()
  return headerEntries(source).find(([name]) => name.toLowerCase() === normalizedRequestedName)?.[1]
}

export function filterAnalyticsProxyRequestHeaders(source: HeaderSource): Headers {
  const result = new Headers()
  for (const [name, value] of headerEntries(source)) {
    const normalizedName = name.toLowerCase()
    if (FORWARDABLE_REQUEST_HEADERS.has(normalizedName)) result.set(normalizedName, value)
  }
  return result
}

function filterAnalyticsProxyResponseHeaders(source: Headers): Headers {
  const result = new Headers()
  source.forEach((value, name) => {
    if (FORWARDABLE_RESPONSE_HEADERS.has(name.toLowerCase())) result.set(name, value)
  })
  return result
}

function parseRequestContentLength(headers: HeaderSource): number {
  const rawLength = getHeader(headers, 'content-length')
  if (rawLength === undefined || !/^(0|[1-9]\d*)$/.test(rawLength)) {
    throw new AnalyticsProxyError(411, 'Length Required')
  }

  const length = Number(rawLength)
  if (!Number.isSafeInteger(length)) throw new AnalyticsProxyError(413, 'Content Too Large')
  if (length > MAX_ANALYTICS_REQUEST_BYTES) throw new AnalyticsProxyError(413, 'Content Too Large')
  return length
}

async function readRequestBody(request: AnalyticsProxyRequest, declaredLength: number): Promise<Uint8Array> {
  const body = await request.readBody(MAX_ANALYTICS_REQUEST_BYTES) ?? new Uint8Array()
  if (body.byteLength > MAX_ANALYTICS_REQUEST_BYTES) {
    throw new AnalyticsProxyError(413, 'Content Too Large')
  }
  if (body.byteLength !== declaredLength) {
    throw new AnalyticsProxyError(400, 'Bad Request', 'Invalid Content-Length')
  }
  return body
}

interface DestroyableRequestStream extends AsyncIterable<Uint8Array | string> {
  destroy?: () => void
}

/**
 * Read an inbound Node/Nitro request without first buffering an untrusted body.
 * The stream is destroyed immediately when its cumulative size crosses the
 * policy cap, so a false Content-Length cannot turn the proxy into a memory sink.
 */
export async function readBoundedAnalyticsRequestBody(
  stream: DestroyableRequestStream,
  maxBytes = MAX_ANALYTICS_REQUEST_BYTES,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    for await (const rawChunk of stream) {
      const chunk = typeof rawChunk === 'string'
        ? new TextEncoder().encode(rawChunk)
        : rawChunk
      totalBytes += chunk.byteLength
      if (totalBytes > maxBytes) {
        stream.destroy?.()
        throw new AnalyticsProxyError(413, 'Content Too Large')
      }
      chunks.push(chunk)
    }
  }
  catch (error) {
    if (error instanceof AnalyticsProxyError) throw error
    stream.destroy?.()
    throw new AnalyticsProxyError(400, 'Bad Request', 'Unable to read analytics request body')
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return
  try {
    await body.cancel()
  }
  catch {
    // The response is being rejected regardless; cancellation is best-effort.
  }
}

async function readBoundedResponseBody(response: Response): Promise<Uint8Array> {
  const rawContentLength = response.headers.get('content-length')
  if (rawContentLength && /^\d+$/.test(rawContentLength)) {
    const declaredLength = Number(rawContentLength)
    if (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_ANALYTICS_RESPONSE_BYTES) {
      await cancelBody(response.body)
      throw new AnalyticsProxyError(502, 'Bad Gateway', 'Analytics upstream response exceeded the size limit')
    }
  }

  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    totalBytes += value.byteLength
    if (totalBytes > MAX_ANALYTICS_RESPONSE_BYTES) {
      try {
        await reader.cancel()
      }
      catch {
        // The bounded failure is still returned if the peer already closed.
      }
      throw new AnalyticsProxyError(502, 'Bad Gateway', 'Analytics upstream response exceeded the size limit')
    }
    chunks.push(value)
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function asUpstreamFailure(error: unknown): AnalyticsProxyError {
  if (error instanceof AnalyticsProxyError) return error
  return new AnalyticsProxyError(502, 'Bad Gateway', 'Analytics upstream request failed')
}

export async function executeAnalyticsProxyRequest(
  request: AnalyticsProxyRequest,
  dependencies: AnalyticsProxyDependencies,
): Promise<AnalyticsProxyResult> {
  const policy = classifyAnalyticsProxyRequest(request.path, request.method)
  await dependencies.enforceRateLimit(policy.rateLimitBucket)

  const declaredLength = policy.method === 'POST'
    ? parseRequestContentLength(request.headers)
    : undefined

  const body = declaredLength === undefined
    ? undefined
    : await readRequestBody(request, declaredLength)

  let upstream: Response
  try {
    // readBoundedAnalyticsRequestBody always returns an owned Uint8Array backed
    // by ArrayBuffer; slice to the exact byte range for the Fetch BodyInit type.
    const fetchBody = body
      ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
      : undefined
    upstream = await dependencies.fetch(buildAnalyticsProxyTarget(policy, request.query), {
      method: policy.method,
      headers: filterAnalyticsProxyRequestHeaders(request.headers),
      body: fetchBody,
      redirect: 'manual',
    })
  }
  catch (error) {
    throw asUpstreamFailure(error)
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    await cancelBody(upstream.body)
    throw new AnalyticsProxyError(
      502,
      'Bad Gateway',
      'Analytics upstream returned an unexpected redirect',
    )
  }

  let responseBody: Uint8Array
  try {
    responseBody = await readBoundedResponseBody(upstream)
  }
  catch (error) {
    throw asUpstreamFailure(error)
  }

  return {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: filterAnalyticsProxyResponseHeaders(upstream.headers),
    body: responseBody,
  }
}
