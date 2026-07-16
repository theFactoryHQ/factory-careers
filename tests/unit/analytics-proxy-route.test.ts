import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeEvent {
  method: string
  path: string
  url: string
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  responseStatus?: number
  responseStatusText?: string
  node: {
    req: FakeRequestStream
  }
}

interface FakeRequestStream extends AsyncIterable<Uint8Array> {
  destroy: ReturnType<typeof vi.fn>
  consumedChunks: number
}

function makeRequestStream(chunks: Uint8Array[]): FakeRequestStream {
  const stream: FakeRequestStream = {
    destroy: vi.fn(),
    consumedChunks: 0,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        stream.consumedChunks += 1
        yield chunk
      }
    },
  }
  return stream
}

const fetchMock = vi.fn()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (event: FakeEvent) => event.path)
vi.stubGlobal('getRequestURL', (event: FakeEvent) => new URL(event.url))
vi.stubGlobal('getRequestHeaders', (event: FakeEvent) => event.requestHeaders)
vi.stubGlobal('getRequestIP', () => '198.51.100.10')
vi.stubGlobal('getHeader', (event: FakeEvent, name: string) => event.requestHeaders[name.toLowerCase()])
vi.stubGlobal('setResponseHeaders', (event: FakeEvent, headers: Record<string, string | number>) => {
  for (const [name, value] of Object.entries(headers)) event.responseHeaders[name] = String(value)
})
vi.stubGlobal('setResponseHeader', (event: FakeEvent, name: string, value: string | number) => {
  event.responseHeaders[name] = String(value)
})
vi.stubGlobal('setResponseStatus', (event: FakeEvent, status: number, statusText?: string) => {
  event.responseStatus = status
  event.responseStatusText = statusText
})
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string, message?: string }) =>
  Object.assign(new Error(options.message ?? options.statusMessage), options),
)
vi.stubGlobal('env', { TRUSTED_PROXY_IP: undefined })
vi.stubGlobal('fetch', fetchMock)

const { default: handler } = await import('../../server/routes/ingest/[...path]') as {
  default: (event: FakeEvent) => Promise<Uint8Array>
}

function makeEvent(overrides: Partial<FakeEvent> = {}): FakeEvent {
  return {
    method: 'POST',
    path: 'e',
    url: 'https://careers.thefactoryhq.com/ingest/e',
    requestHeaders: {
      'content-length': '2',
      'content-type': 'application/json',
    },
    responseHeaders: {},
    node: { req: makeRequestStream([new Uint8Array([123, 125])]) },
    ...overrides,
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
})

describe('PostHog ingest route adapter', () => {
  it('rejects an unknown path without calling upstream', async () => {
    const event = makeEvent({ path: 'api/projects', url: 'https://careers.thefactoryhq.com/ingest/api/projects' })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(event.node.req.consumedChunks).toBe(0)
  })

  it('rejects a capture request without Content-Length before calling upstream', async () => {
    const event = makeEvent({ requestHeaders: {} })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 411 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(event.node.req.consumedChunks).toBe(0)
  })

  it('destroys a chunked request stream as soon as its actual body crosses 1 MiB', async () => {
    const requestStream = makeRequestStream([
      new Uint8Array(700 * 1024),
      new Uint8Array(400 * 1024),
      new Uint8Array(10),
    ])
    const event = makeEvent({
      requestHeaders: { 'content-length': '1' },
      node: { req: requestStream },
    })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 413 })
    expect(requestStream.destroy).toHaveBeenCalledTimes(1)
    expect(requestStream.consumedChunks).toBe(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adapts a capture request with repeated query values and the ingestion limiter', async () => {
    const event = makeEvent({
      url: 'https://careers.thefactoryhq.com/ingest/e?ip=one&ip=two',
      requestHeaders: {
        'content-length': '2',
        'content-type': 'application/json',
        cookie: 'session=secret',
        authorization: 'Bearer secret',
        'cf-ray': 'secret',
        'x-forwarded-for': '203.0.113.7',
      },
    })

    const body = await handler(event)

    const [target, init] = fetchMock.mock.calls[0]!
    expect(target).toBe('https://eu.i.posthog.com/e?ip=one&ip=two')
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' })
    expect(Object.fromEntries((init.headers as Headers).entries())).toEqual({ 'content-type': 'application/json' })
    expect(event.responseHeaders['X-RateLimit-Limit']).toBe('120')
    expect(event.responseStatus).toBe(200)
    expect(event.responseHeaders['content-type']).toBe('application/json')
    expect(new TextDecoder().decode(body)).toBe('{}')
  })

  it('routes static HEAD requests through the assets host and higher asset limiter without reading a body', async () => {
    const event = makeEvent({
      method: 'HEAD',
      path: 'static/1.390.0/exception-autocapture.js',
      url: 'https://careers.thefactoryhq.com/ingest/static/1.390.0/exception-autocapture.js?v=1',
      requestHeaders: { accept: 'application/javascript' },
    })

    await handler(event)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://eu-assets.i.posthog.com/static/1.390.0/exception-autocapture.js?v=1',
      expect.objectContaining({ method: 'HEAD', redirect: 'manual' }),
    )
    expect(event.responseHeaders['X-RateLimit-Limit']).toBe('600')
    expect(event.node.req.consumedChunks).toBe(0)
  })
})
