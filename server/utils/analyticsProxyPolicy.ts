const INGESTION_ORIGIN = 'https://eu.i.posthog.com'
const ASSETS_ORIGIN = 'https://eu-assets.i.posthog.com'

export const MAX_ANALYTICS_REQUEST_BYTES = 1024 * 1024
export const MAX_ANALYTICS_RESPONSE_BYTES = 2 * 1024 * 1024
export const ANALYTICS_PROXY_TIMEOUT_MS = 10_000

const SAFE_STATIC_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/
const SAFE_PROJECT_TOKEN = /^[A-Za-z0-9_-]+$/

const FORWARDABLE_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'content-type',
  'origin',
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
  readBody: (maxBytes: number, signal: AbortSignal) => Promise<Uint8Array | undefined>
  drainBody: () => void
}

export interface AnalyticsProxyDependencies {
  fetch: (input: string, init: RequestInit) => Promise<Response>
  enforceRateLimit: (bucket: AnalyticsRateLimitBucket) => Promise<void>
  timeoutSignal?: AbortSignal
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

function rejectBodyOnBodylessMethod(request: AnalyticsProxyRequest): void {
  const rawLength = getHeader(request.headers, 'content-length')
  const transferEncoding = getHeader(request.headers, 'transfer-encoding')
  const hasDeclaredBody = rawLength !== undefined && rawLength !== '0'
  const hasTransferBody = transferEncoding !== undefined

  if (!hasDeclaredBody && !hasTransferBody) return

  request.drainBody()
  if (rawLength && /^(0|[1-9]\d*)$/.test(rawLength)) {
    const length = Number(rawLength)
    if (!Number.isSafeInteger(length) || length > MAX_ANALYTICS_REQUEST_BYTES) {
      throw new AnalyticsProxyError(413, 'Content Too Large')
    }
  }
  throw new AnalyticsProxyError(400, 'Bad Request', 'Request body is not allowed for this method')
}

async function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  timeoutMessage: string,
  statusCode = 502,
  statusMessage = 'Bad Gateway',
): Promise<T> {
  if (signal.aborted) {
    throw new AnalyticsProxyError(statusCode, statusMessage, timeoutMessage)
  }

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AnalyticsProxyError(statusCode, statusMessage, timeoutMessage))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

async function readRequestBody(
  request: AnalyticsProxyRequest,
  declaredLength: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  let body: Uint8Array | undefined
  try {
    body = await withAbort(
      request.readBody(MAX_ANALYTICS_REQUEST_BYTES, signal),
      signal,
      'Analytics request body timed out',
      408,
      'Request Timeout',
    )
  }
  catch (error) {
    if (error instanceof AnalyticsProxyError && error.statusCode === 408) request.drainBody()
    throw error
  }
  body ??= new Uint8Array()
  if (body.byteLength > MAX_ANALYTICS_REQUEST_BYTES) {
    throw new AnalyticsProxyError(413, 'Content Too Large')
  }
  if (body.byteLength !== declaredLength) {
    throw new AnalyticsProxyError(400, 'Bad Request', 'Invalid Content-Length')
  }
  return body
}

interface DrainableRequestStream extends AsyncIterable<Uint8Array | string> {
  iterator: (options: { destroyOnReturn: boolean }) => AsyncIterator<Uint8Array | string>
  resume: () => unknown
}

function releaseIteratorAndDrain(
  iterator: AsyncIterator<Uint8Array | string>,
  stream: DrainableRequestStream,
): void {
  try {
    // Initiate iterator detachment without awaiting it: Node can keep this
    // promise pending until a slow client finishes its declared body.
    void iterator.return?.().catch(() => undefined)
  }
  catch {
    // Cleanup failures must not replace the policy response.
  }
  try {
    // Resuming discards any later request bytes without retaining them.
    stream.resume()
  }
  catch {
    // A stream that already failed may reject resume; preserve the response.
  }
}

/**
 * Read an inbound Node/Nitro request without first buffering an untrusted body.
 * Once cumulative size crosses the cap, retained chunks are released and the
 * rest is drained without destroying the socket, so Nitro can still emit 413.
 */
export async function readBoundedAnalyticsRequestBody(
  stream: DrainableRequestStream,
  maxBytes = MAX_ANALYTICS_REQUEST_BYTES,
  signal?: AbortSignal,
  onDrain?: () => void,
): Promise<Uint8Array> {
  const body = new Uint8Array(maxBytes)
  let totalBytes = 0
  const iterator = stream.iterator({ destroyOnReturn: false })

  try {
    while (true) {
      const { done, value: rawChunk } = signal
        ? await withAbort(
            iterator.next(),
            signal,
            'Analytics request body timed out',
            408,
            'Request Timeout',
          )
        : await iterator.next()
      if (done) break
      const chunk = typeof rawChunk === 'string'
        ? new TextEncoder().encode(rawChunk)
        : rawChunk
      totalBytes += chunk.byteLength
      if (totalBytes > maxBytes) {
        // Returning this iterator with destroyOnReturn:false detaches it
        // without destroying the socket; resume then drains/discards the
        // remaining request so Nitro can send 413.
        onDrain?.()
        releaseIteratorAndDrain(iterator, stream)
        throw new AnalyticsProxyError(413, 'Content Too Large')
      }
      body.set(chunk, totalBytes - chunk.byteLength)
    }
  }
  catch (error) {
    if (error instanceof AnalyticsProxyError) {
      if (error.statusCode === 408) {
        onDrain?.()
        releaseIteratorAndDrain(iterator, stream)
      }
      throw error
    }
    onDrain?.()
    releaseIteratorAndDrain(iterator, stream)
    throw new AnalyticsProxyError(400, 'Bad Request', 'Unable to read analytics request body')
  }

  return body.subarray(0, totalBytes)
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

async function readBoundedResponseBody(response: Response, signal: AbortSignal): Promise<Uint8Array> {
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
  const body = new Uint8Array(MAX_ANALYTICS_RESPONSE_BYTES)
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await withAbort(
        reader.read(),
        signal,
        'Analytics upstream response timed out',
      )
      if (done) break
      if (!value) continue

      const nextTotalBytes = totalBytes + value.byteLength
      if (nextTotalBytes > MAX_ANALYTICS_RESPONSE_BYTES) {
        try {
          await reader.cancel()
        }
        catch {
          // The bounded failure is still returned if the peer already closed.
        }
        throw new AnalyticsProxyError(502, 'Bad Gateway', 'Analytics upstream response exceeded the size limit')
      }
      body.set(value, totalBytes)
      totalBytes = nextTotalBytes
    }
  }
  catch (error) {
    if (error instanceof AnalyticsProxyError && error.message.includes('timed out')) {
      await reader.cancel().catch(() => undefined)
    }
    throw error
  }

  return body.subarray(0, totalBytes)
}

function asUpstreamFailure(error: unknown): AnalyticsProxyError {
  if (error instanceof AnalyticsProxyError) return error
  return new AnalyticsProxyError(502, 'Bad Gateway', 'Analytics upstream request failed')
}

export async function executeAnalyticsProxyRequest(
  request: AnalyticsProxyRequest,
  dependencies: AnalyticsProxyDependencies,
): Promise<AnalyticsProxyResult> {
  const timeoutSignal = dependencies.timeoutSignal
    ?? AbortSignal.timeout(ANALYTICS_PROXY_TIMEOUT_MS)
  let policy: AnalyticsProxyPolicy
  try {
    policy = classifyAnalyticsProxyRequest(request.path, request.method)
  }
  catch (error) {
    request.drainBody()
    throw error
  }
  try {
    await dependencies.enforceRateLimit(policy.rateLimitBucket)
  }
  catch (error) {
    request.drainBody()
    throw error
  }

  let declaredLength: number | undefined
  if (policy.method === 'POST') {
    try {
      declaredLength = parseRequestContentLength(request.headers)
    }
    catch (error) {
      if (error instanceof AnalyticsProxyError && error.statusCode === 413) {
        try {
          await request.readBody(MAX_ANALYTICS_REQUEST_BYTES, timeoutSignal)
        }
        catch (readError) {
          if (readError instanceof AnalyticsProxyError && readError.statusCode === 408) throw readError
          // The bounded reader already drained an oversized body. Preserve the
          // declared-size 413 instead of exposing stream/parser details.
        }
        throw error
      }
      request.drainBody()
      throw error
    }
  }
  else {
    rejectBodyOnBodylessMethod(request)
  }

  const body = declaredLength === undefined
    ? undefined
    : await readRequestBody(request, declaredLength, timeoutSignal)

  let upstream: Response
  try {
    // readBoundedAnalyticsRequestBody always returns an owned Uint8Array backed
    // by ArrayBuffer; slice to the exact byte range for the Fetch BodyInit type.
    const fetchBody = body
      ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
      : undefined
    upstream = await withAbort(
      dependencies.fetch(buildAnalyticsProxyTarget(policy, request.query), {
        method: policy.method,
        headers: filterAnalyticsProxyRequestHeaders(request.headers),
        body: fetchBody,
        redirect: 'manual',
        signal: timeoutSignal,
      }),
      timeoutSignal,
      'Analytics upstream request timed out',
    )
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
    responseBody = await readBoundedResponseBody(upstream, timeoutSignal)
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
